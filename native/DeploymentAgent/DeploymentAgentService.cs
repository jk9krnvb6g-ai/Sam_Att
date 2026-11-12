using System;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.ServiceProcess;
using System.Diagnostics;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using Microsoft.Win32.SafeHandles;

// No TCP listener. The only untrusted input forwarded to Node is one bounded frame
// from an allowlisted local Windows token; Node additionally verifies its HMAC.
public sealed class DeploymentAgentService : ServiceBase {
    public sealed class Config {
        public string NodePath, WorkerPath, PipeName, GatewaySid, AgentSid, Mode, IsolatedPackageSid;
        public string NodeSha256, WorkerSha256;
    }
    [StructLayout(LayoutKind.Sequential)] struct SecurityAttributes {
        public int Length; public IntPtr Descriptor; public bool Inherit;
    }
    [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern bool ConvertStringSecurityDescriptorToSecurityDescriptor(string s, uint v, out IntPtr p, out uint n);
    [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr p);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern SafePipeHandle CreateNamedPipe(string name, uint open, uint mode, uint instances, uint output, uint input, uint timeout, ref SecurityAttributes sa);
    [DllImport("advapi32.dll", SetLastError=true)] static extern bool ImpersonateNamedPipeClient(SafePipeHandle pipe);
    [DllImport("advapi32.dll", SetLastError=true)] static extern bool RevertToSelf();
    [DllImport("advapi32.dll")] static extern uint GetSecurityInfo(IntPtr handle, int type, uint info, out IntPtr owner, out IntPtr group, out IntPtr dacl, out IntPtr sacl, out IntPtr sd);
    [DllImport("advapi32.dll", CharSet=CharSet.Unicode)] static extern bool ConvertSecurityDescriptorToStringSecurityDescriptor(IntPtr sd, uint rev, uint info, out IntPtr str, out uint length);
    [StructLayout(LayoutKind.Sequential)] struct BasicJobLimits {
        public long ProcessTime, JobTime; public uint Flags; public UIntPtr MinWorkingSet, MaxWorkingSet;
        public uint ActiveProcesses; public UIntPtr Affinity; public uint Priority, Scheduling;
    }
    [StructLayout(LayoutKind.Sequential)] struct IoCounters { public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes; }
    [StructLayout(LayoutKind.Sequential)] struct ExtendedJobLimits {
        public BasicJobLimits Basic; public IoCounters Io; public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
    }
    [DllImport("kernel32.dll", SetLastError=true)] static extern SafeFileHandle CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(SafeFileHandle job, int info, ref ExtendedJobLimits data, uint length);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(SafeFileHandle job, IntPtr process);
    SafeFileHandle workerJob;
    readonly string configPath;
    bool consoleMode;
    Config config;
    Process worker;
    NamedPipeServerStream pipe;
    CancellationTokenSource stopping = new CancellationTokenSource();
    Task loop;
    const uint FIRST_INSTANCE = 0x00080000, OVERLAPPED = 0x40000000, REJECT_REMOTE = 8;
    public DeploymentAgentService(string path) { configPath = Path.GetFullPath(path); ServiceName = "SamchukSamAttDeployAgent"; CanStop = true; AutoLog = false; }
    static string Hash(string path) {
        using (var sha = System.Security.Cryptography.SHA256.Create())
        using (var stream = File.OpenRead(path)) return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
    }
    static void RequireFile(string path, string hash) {
        if (!Path.IsPathRooted(path) || !File.Exists(path) || hash == null || hash.Length != 64 || Hash(path) != hash.ToLowerInvariant()) throw new InvalidOperationException("EXECUTABLE_HASH_MISMATCH");
    }
    public void StartHost() {
        config = new JavaScriptSerializer().Deserialize<Config>(File.ReadAllText(configPath));
        if (config == null || config.PipeName == null || !System.Text.RegularExpressions.Regex.IsMatch(config.PipeName, "^[A-Za-z0-9_-]{8,100}$")) throw new InvalidOperationException("INVALID_PIPE_NAME");
        if (config.Mode != "PRODUCTION" && !(consoleMode && config.Mode == "ISOLATED")) throw new InvalidOperationException("SERVICE_REQUIRES_PRODUCTION_MODE");
        if (config.IsolatedPackageSid != null && !(consoleMode && config.Mode == "ISOLATED" && config.IsolatedPackageSid.StartsWith("S-1-15-2-"))) throw new InvalidOperationException("PRODUCTION_PACKAGE_SID_FORBIDDEN");
        if(config.Mode == "PRODUCTION" && (!config.AgentSid.StartsWith("S-1-5-80-") || config.AgentSid == config.GatewaySid || config.PipeName != "SamchukSamAttDeploymentAgent_v2")) throw new InvalidOperationException("DEDICATED_SERVICE_IDENTITY_REQUIRED");
        new SecurityIdentifier(config.GatewaySid); new SecurityIdentifier(config.AgentSid);
        if (WindowsIdentity.GetCurrent().User.Value != config.AgentSid) throw new InvalidOperationException("WRONG_AGENT_IDENTITY");
        RequireFile(config.NodePath, config.NodeSha256); RequireFile(config.WorkerPath, config.WorkerSha256);
        // First handle is created synchronously: SCM startup fails if name is squatted.
        pipe = CreateSecurePipe();
        var start = new ProcessStartInfo(config.NodePath, "\"" + config.WorkerPath + "\" --config \"" + configPath + "\"");
        start.UseShellExecute = false; start.CreateNoWindow = true;
        start.WorkingDirectory = Path.GetDirectoryName(config.WorkerPath);
        start.RedirectStandardInput = true; start.RedirectStandardOutput = true; start.RedirectStandardError = true;
        workerJob = CreateJobObject(IntPtr.Zero, null);
        if (workerJob.IsInvalid) throw new System.ComponentModel.Win32Exception();
        var limits = new ExtendedJobLimits(); limits.Basic.Flags = 0x2000; // KILL_ON_JOB_CLOSE
        if (!SetInformationJobObject(workerJob, 9, ref limits, (uint)Marshal.SizeOf(typeof(ExtendedJobLimits)))) throw new System.ComponentModel.Win32Exception();
        worker = Process.Start(start);
        if (!AssignProcessToJobObject(workerJob, worker.Handle)) { worker.Kill(); throw new System.ComponentModel.Win32Exception(); }
        worker.ErrorDataReceived += (s,e) => { if (e.Data != null) Console.Error.WriteLine("worker: " + e.Data); };
        worker.BeginErrorReadLine();
        var ready = worker.StandardOutput.ReadLineAsync();
        if (!ready.Wait(30000) || ready.Result != "WORKER_READY") { worker.Kill(); pipe.Dispose(); throw new InvalidOperationException("WORKER_NOT_READY"); }
        loop = Task.Run((Func<Task>)RunLoop);
    }
    NamedPipeServerStream CreateSecurePipe() {
        // Explicit protected DACL: neither Everyone nor Authenticated Users gets access.
        string sddl = "D:P(A;;GA;;;SY)(A;;GA;;;" + config.AgentSid + ")(A;;0x12019f;;;" + config.GatewaySid + ")" + (config.IsolatedPackageSid == null ? "" : "(A;;0x12019f;;;" + config.IsolatedPackageSid + ")") + (config.Mode == "ISOLATED" ? "S:(ML;;NW;;;LW)" : "S:(ML;;NW;;;ME)");
        IntPtr descriptor; uint size;
        if (!ConvertStringSecurityDescriptorToSecurityDescriptor(sddl, 1, out descriptor, out size)) throw new System.ComponentModel.Win32Exception();
        try {
            var sa = new SecurityAttributes { Length = Marshal.SizeOf(typeof(SecurityAttributes)), Descriptor = descriptor, Inherit = false };
            var handle = CreateNamedPipe(@"\\.\pipe\" + config.PipeName, 3 | FIRST_INSTANCE | OVERLAPPED, REJECT_REMOTE, 1, 65536, 65536, 10000, ref sa);
            if (handle.IsInvalid) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            if (Environment.UserInteractive) {
                IntPtr o,g,d,a,sd,ss; uint len;
                uint error = GetSecurityInfo(handle.DangerousGetHandle(), 6, 0x10, out o,out g,out d,out a,out sd);
                if (error == 0) { if(ConvertSecurityDescriptorToStringSecurityDescriptor(sd,1,0x10,out ss,out len)) { Console.WriteLine("PIPE_LABEL: " + Marshal.PtrToStringUni(ss)); LocalFree(ss); } LocalFree(sd); }
            }
            var result = new NamedPipeServerStream(PipeDirection.InOut, true, false, handle);
            // Verify the actual kernel object's DACL, not just the requested SDDL.
            var actual = result.GetAccessControl();
            if (Environment.UserInteractive) Console.WriteLine("PIPE_DACL: " + actual.GetSecurityDescriptorSddlForm(AccessControlSections.Access));
            if (!actual.AreAccessRulesProtected) { result.Dispose(); throw new InvalidOperationException("PIPE_DACL_NOT_PROTECTED"); }
            foreach (PipeAccessRule rule in actual.GetAccessRules(true, true, typeof(SecurityIdentifier))) {
                string sid = rule.IdentityReference.Value;
                if (rule.AccessControlType != AccessControlType.Allow || (sid != "S-1-5-18" && sid != config.AgentSid && sid != config.GatewaySid && sid != config.IsolatedPackageSid)) {
                    result.Dispose(); throw new InvalidOperationException("PIPE_DACL_TOO_BROAD");
                }
            }
            return result;
        } finally { LocalFree(descriptor); }
    }
    async Task<string> ReadFrame(Stream stream, int timeoutMs) {
        var bytes = new byte[65537]; int count = 0; var deadline = Stopwatch.StartNew();
        while (count < 65536) {
            var read = stream.ReadAsync(bytes, count, 1);
            if (await Task.WhenAny(read, Task.Delay(Math.Max(1, timeoutMs - (int)deadline.ElapsedMilliseconds), stopping.Token)) != read) throw new System.TimeoutException("PIPE_FRAME_TIMEOUT");
            if (await read == 0) throw new EndOfStreamException();
            if (bytes[count++] == 10) return new UTF8Encoding(false, true).GetString(bytes, 0, count - 1);
        }
        throw new InvalidDataException("PIPE_FRAME_TOO_LARGE");
    }
    async Task RunLoop() {
        try {
            while (!stopping.IsCancellationRequested) {
                await pipe.WaitForConnectionAsync(stopping.Token);
                bool dispatched = false;
                try {
                    string frame = await ReadFrame(pipe, 10000);
                    if (!ImpersonateNamedPipeClient(pipe.SafePipeHandle)) throw new System.ComponentModel.Win32Exception();
                    string sid;
                    try { sid = WindowsIdentity.GetCurrent().User.Value; }
                    finally { if (!RevertToSelf()) Environment.FailFast("REVERT_TO_SELF_FAILED"); }
                    if (sid != config.GatewaySid) throw new UnauthorizedAccessException("PIPE_CLIENT_FORBIDDEN");
                    // Keep a single worker for nonce memory and operation lifetime. No
                    // request can be accepted while the previous operation is executing.
                    dispatched = true;
                    await worker.StandardInput.WriteLineAsync(frame);
                    await worker.StandardInput.FlushAsync();
                    var response = worker.StandardOutput.ReadLineAsync();
                    if (await Task.WhenAny(response, Task.Delay(60 * 60 * 1000, stopping.Token)) != response) throw new System.TimeoutException("WORKER_TIMEOUT");
                    string line = await response;
                    if (line == null || line.Length > 8 * 1024 * 1024) throw new InvalidDataException("WORKER_RESPONSE_INVALID");
                    byte[] data = Encoding.UTF8.GetBytes(line + "\n");
                    await pipe.WriteAsync(data, 0, data.Length); await pipe.FlushAsync();
                } catch (IOException) { /* A disconnected client never cancels deployment. */ }
                  catch (UnauthorizedAccessException) { /* Reject before the worker boundary. */ }
                  catch (InvalidDataException) { }
                  catch (System.TimeoutException) { if (dispatched || worker.HasExited) throw; }
                finally { if (pipe.IsConnected) pipe.Disconnect(); }
                // Reuse the original handle: the first-instance reservation is never lost.
            }
        } catch (OperationCanceledException) { }
          catch (Exception e) { if (stopping.IsCancellationRequested) return; Console.Error.WriteLine("HOST_FATAL: " + e.GetType().Name); ExitCode = 1; stopping.Cancel(); if (!Environment.UserInteractive) Stop(); }
    }
    public void StopHost() {
        stopping.Cancel(); if (pipe != null) pipe.Dispose();
        // Worker exit can leave a durable deployment journal/lock. Never auto-clear it.
        if (worker != null && !worker.HasExited) { worker.StandardInput.Close(); if (!worker.WaitForExit(5000)) worker.Kill(); }
        if (workerJob != null) workerJob.Dispose();
        if (loop != null) { try { loop.Wait(5000); } catch (AggregateException) {} }
    }
    protected override void OnStart(string[] args) { RequestAdditionalTime(45000); try { StartHost(); } catch { StopHost(); throw; } }
    protected override void OnStop() { StopHost(); }
    public static int Main(string[] args) {
        try {
            if (args.Length != 2 || (args[0] != "--service" && args[0] != "--console")) throw new ArgumentException("Use --service|--console config.json");
            var service = new DeploymentAgentService(args[1]);
            if (args[0] == "--service") ServiceBase.Run(service);
            else { service.consoleMode = true; service.StartHost(); Console.WriteLine("HOST_READY: explicit DACL; PIPE_REJECT_REMOTE_CLIENTS; FIRST_PIPE_INSTANCE"); Console.ReadLine(); service.StopHost(); }
            return service.ExitCode;
        } catch (Exception e) { Console.Error.WriteLine("HOST_START_FAILED: " + e.Message); return 1; }
    }
}
