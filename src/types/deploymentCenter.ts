export type ChecklistItemStatus =
  | 'PASS'
  | 'FAIL'
  | 'WARNING'
  | 'NOT_CHECKED'
  | 'NOT_AVAILABLE';

export type VersionComparisonStatus =
  | 'UP_TO_DATE'
  | 'UPDATE_AVAILABLE'
  | 'NOT_AVAILABLE'
  | 'ERROR';

export type DeploymentJobStatus =
  | 'PENDING'
  | 'PREFLIGHT'
  | 'BUILDING'
  | 'BACKUP'
  | 'DEPLOYING'
  | 'VERIFYING'
  | 'SUCCESS'
  | 'FAILED'
  | 'ROLLED_BACK'
  | 'MAINTENANCE_REQUIRED';

export type RollbackExecutionStatus =
  | 'NONE'
  | 'IN_PROGRESS'
  | 'ROLLED_BACK'
  | 'ROLLBACK_FAILED'
  | 'ROLLBACK_FAILED_CRITICAL';

export interface PreflightCheckEvidence {
  commitSha?: string;
  verifiedAt?: string;
  artifactSha256?: string;
  evidenceSource?: string;
}

export interface DeploymentChecklistItem {
  id: string;
  stepNumber: number;
  label: string;
  description: string;
  status: ChecklistItemStatus;
  detail: string;
  checkedAt: string | null;
  evidence?: PreflightCheckEvidence;
}

export interface ServerVersionInfo {
  version: string;
  commitSha: string;
  deploymentDate: string;
  configured: boolean;
  source: string;
  manifestPath?: string;
  manifestValid?: boolean;
  manifestStatus?: 'VERIFIED' | 'NOT_AVAILABLE' | 'INVALID_MANIFEST';
  manifestError?: string | null;
  backupId?: string | null;
  deployedBy?: string | null;
  rollbackAvailableFrom?: string | null;
  frontendArtifactSha256?: string | null;
  backendArtifactSha256?: string | null;
}

export interface GitHubVersionInfo {
  repositoryUrl: string;
  version: string;
  commitSha: string;
  latestCommitDate: string;
  commitMessage?: string;
  branch: string;
  reachable: boolean;
  configured: boolean;
  message: string;
}

export interface VersionComparisonResult {
  status: VersionComparisonStatus;
  statusLabel: string;
  summary: string;
  currentCommitSha?: string;
  latestGitHubCommitSha?: string;
  comparisonStatus?: VersionComparisonStatus;
  comparisonMessage?: string;
}

export interface PostDeployHealthCheckItem {
  id:
    | 'frontend_sam_att'
    | 'backend_sam_att'
    | 'authentication'
    | 'mysql_connection'
    | 'sam_att_router'
    | 'version_manifest'
    | 'procurement_health';
  label: string;
  healthy: boolean;
  passed?: boolean;
  statusCode?: number;
  detail: string;
}

export interface PostDeployHealthCheckReport {
  overallHealthy: boolean;
  allPassed?: boolean;
  checkedAt: string;
  summary: string;
  items: PostDeployHealthCheckItem[];
}

export interface DeploymentStepProgress {
  stepNumber: number;
  step?: number;
  id: string;
  label: string;
  status:
    | 'PENDING'
    | 'RUNNING'
    | 'IN_PROGRESS'
    | 'COMPLETED'
    | 'FAILED'
    | 'SKIPPED'
    | 'MAINTENANCE_REQUIRED';
  detail?: string;
  timestamp?: string;
}

export interface DeploymentProgressState {
  deploymentId: string;
  previousCommitSha?: string;
  targetCommitSha: string;
  version: string;
  status: DeploymentJobStatus;
  currentStepNumber: number;
  currentStep?: number;
  totalSteps: number;
  currentStepLabel: string;
  stepLabel?: string;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  approvedBy: string;
  backupId: string | null;
  buildTestSummary: string;
  healthCheckReport: PostDeployHealthCheckReport | null;
  rollbackStatus: RollbackExecutionStatus;
  errorDetails: string | null;
  criticalRecoveryAdvice?: string | null;
  steps: DeploymentStepProgress[];
}

export interface DeploymentBackupSummary {
  backupId: string;
  createdAt: string;
  commitSha: string;
  previousCommitSha?: string;
  version: string;
  frontendArtifactSha256: string;
  backendArtifactSha256: string;
  verified: boolean;
  backupPath: string;
}

export interface DeploymentHistoryItem {
  id: string;
  deploymentId?: string;
  deployedAt: string;
  startedAt?: string;
  finishedAt?: string;
  version?: string;
  commitSha?: string;
  previousCommitSha?: string;
  targetCommitSha?: string;
  versionOrCommit: string;
  actor: string;
  actorName: string;
  approvedBy?: string;
  buildTestResult?: string;
  preflightSummary?: string;
  backupId?: string | null;
  status: DeploymentJobStatus;
  healthCheckResult?: string;
  healthCheckSummary?: string;
  rollbackStatus?: RollbackExecutionStatus;
  errorSanitized?: string | null;
  errorSummary?: string | null;
  criticalRecoveryAdvice?: string | null;
  summary: string;
}

export interface DeploymentSystemStatus {
  samAttStatus: 'ONLINE' | 'DEGRADED' | 'UNAVAILABLE';
  samAttFrontendPath: string;
  samAttFrontendPort: number;
  backendApiStatus: 'ONLINE' | 'DEGRADED' | 'UNAVAILABLE';
  backendGatewayPath: string;
  backendGatewayPort: number;
  databaseName: string;
  databaseHealthy: boolean;
  githubConnectionStatus:
    | 'CONNECTED'
    | 'NOT_CONFIGURED'
    | 'NOT_AVAILABLE'
    | 'NOT_CHECKED'
    | 'UNAVAILABLE'
    | 'ERROR';
  githubRepositoryUrl: string;
  lastDeployedAt: string;
}

export interface DeploymentReadinessSummary {
  readyToDeploy: boolean;
  passedCount: number;
  failedCount: number;
  warningCount: number;
  notCheckedCount: number;
  totalCount: number;
  readinessStatus:
    | 'READY_TO_DEPLOY'
    | 'NOT_READY'
    | 'CHECKS_INCOMPLETE'
    | 'FAILED_CHECKS'
    | 'AGENT_NOT_CONFIGURED'
    | 'UP_TO_DATE';
  readinessMessage: string;
  targetCommitSha?: string | null;
}

export interface DeploymentCenterStatusPayload {
  success: boolean;
  phase: 'PHASE_1_READ_ONLY' | 'PHASE_2_AGENT_MANAGED';
  isDemoData?: boolean;
  checkedAt: string;
  systemStatus: DeploymentSystemStatus;
  currentVersion: ServerVersionInfo;
  latestGitHubVersion: GitHubVersionInfo;
  versionComparison: VersionComparisonResult;
  checklist: DeploymentChecklistItem[];
  deploymentReadiness?: DeploymentReadinessSummary;
  deploymentAgent: {
    phase2AgentAvailable: boolean;
    approveEnabled: boolean;
    rollbackEnabled: boolean;
    lockReason: string;
    mode?: string;
    latestBackupId?: string | null;
    agentAvailable?: boolean;
    agentStatus?: 'NOT_CONFIGURED' | 'READY' | 'BUSY' | 'OFFLINE';
    ipcTransport?: string;
    namedPipePath?: string;
    canApproveDeploy?: boolean;
    canRollback?: boolean;
    verifiedBackupAvailable?: boolean;
    activeDeploymentLock?: boolean;
    statusMessage?: string;
  };
  activeProgress?: DeploymentProgressState | null;
  availableBackups?: DeploymentBackupSummary[];
  history: DeploymentHistoryItem[];
}

export interface ApproveDeploymentResponse extends Partial<DeploymentCenterStatusPayload> {
  success: boolean;
  status?: DeploymentJobStatus;
  deploymentId?: string;
  previousCommitSha?: string;
  targetCommitSha?: string;
  backupId?: string | null;
  message?: string;
  error?: string;
  progress?: DeploymentProgressState | null;
  healthCheck?: PostDeployHealthCheckReport | null;
  criticalManualRecoveryAdvice?: string | null;
  deploymentResult?: {
    deploymentId: string;
    status: DeploymentJobStatus;
    backupId: string | null;
    previousCommitSha?: string;
    targetCommitSha: string;
    version: string;
    buildTestSummary: string;
    healthCheckReport: PostDeployHealthCheckReport | null;
    rollbackStatus: RollbackExecutionStatus;
    summary: string;
    errorSanitized: string | null;
    criticalRecoveryAdvice?: string | null;
    progress: DeploymentProgressState;
  };
}

export interface RollbackDeploymentResponse extends Partial<DeploymentCenterStatusPayload> {
  success: boolean;
  rollbackExecuted?: boolean;
  status?: 'ROLLED_BACK' | 'ROLLBACK_FAILED' | 'ROLLBACK_FAILED_CRITICAL';
  backupId?: string;
  restoredCommitSha?: string;
  restoredVersion?: string;
  message?: string;
  error?: string;
  healthCheck?: PostDeployHealthCheckReport | null;
  criticalManualRecoveryAdvice?: string | null;
  rollbackResult?: {
    rolledBack: boolean;
    rollbackStatus: RollbackExecutionStatus;
    backupId: string;
    restoredCommitSha: string;
    restoredVersion: string;
    healthCheckReport: PostDeployHealthCheckReport | null;
    summary: string;
    errorSanitized: string | null;
    criticalRecoveryAdvice: string | null;
  };
}
