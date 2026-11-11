export type ChecklistItemStatus = 'PASS' | 'FAIL' | 'WARNING' | 'NOT_CHECKED';

export interface DeploymentChecklistItem {
  id: string;
  stepNumber: number;
  label: string;
  description: string;
  status: ChecklistItemStatus;
  detail: string;
  checkedAt: string;
}

export interface ServerVersionInfo {
  version: string;
  commitSha: string;
  deploymentDate: string;
  configured: boolean;
  source: string;
}

export interface GitHubVersionInfo {
  repositoryUrl: string;
  version: string;
  commitSha: string;
  latestCommitDate: string;
  branch: string;
  reachable: boolean;
  configured: boolean;
  message: string;
}

export interface VersionComparisonResult {
  status: 'UP_TO_DATE' | 'UPDATE_AVAILABLE' | 'NOT_AVAILABLE';
  statusLabel: string;
  summary: string;
}

export interface DeploymentHistoryItem {
  id: string;
  deployedAt: string;
  versionOrCommit: string;
  actor: string;
  actorName: string;
  status: 'SUCCESS' | 'FAILED' | 'ROLLED_BACK';
  summary: string;
}

export interface DeploymentSystemStatus {
  samAttStatus: 'ONLINE' | 'DEGRADED';
  samAttFrontendPath: string;
  samAttFrontendPort: number;
  backendApiStatus: 'ONLINE' | 'DEGRADED';
  backendGatewayPath: string;
  backendGatewayPort: number;
  databaseName: string;
  databaseHealthy: boolean;
  githubConnectionStatus: 'CONNECTED' | 'UNAVAILABLE' | 'NOT_CHECKED';
  githubRepositoryUrl: string;
  lastDeployedAt: string;
}

export interface DeploymentCenterStatusPayload {
  success: boolean;
  phase: 'PHASE_1_READ_ONLY';
  isDemoData?: boolean;
  checkedAt: string;
  systemStatus: DeploymentSystemStatus;
  currentVersion: ServerVersionInfo;
  latestGitHubVersion: GitHubVersionInfo;
  versionComparison: VersionComparisonResult;
  checklist: DeploymentChecklistItem[];
  deploymentAgent: {
    phase2AgentAvailable: boolean;
    approveEnabled: boolean;
    rollbackEnabled: boolean;
    lockReason: string;
  };
  history: DeploymentHistoryItem[];
}
