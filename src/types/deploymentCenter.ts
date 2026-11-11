export type ChecklistItemStatus =
  | 'PASS'
  | 'FAIL'
  | 'WARNING'
  | 'NOT_CHECKED'
  | 'NOT_AVAILABLE';

export interface DeploymentChecklistItem {
  id: string;
  stepNumber: number;
  label: string;
  description: string;
  status: ChecklistItemStatus;
  detail: string;
  checkedAt: string | null;
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
  samAttStatus: 'ONLINE' | 'DEGRADED' | 'UNAVAILABLE';
  samAttFrontendPath: string;
  samAttFrontendPort: number;
  backendApiStatus: 'ONLINE' | 'DEGRADED' | 'UNAVAILABLE';
  backendGatewayPath: string;
  backendGatewayPort: number;
  databaseName: string;
  databaseHealthy: boolean;
  githubConnectionStatus: 'CONNECTED' | 'NOT_CONFIGURED' | 'NOT_AVAILABLE' | 'NOT_CHECKED' | 'UNAVAILABLE';
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
  readinessStatus: 'NOT_READY' | 'CHECKS_INCOMPLETE' | 'FAILED_CHECKS';
  readinessMessage: string;
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
  deploymentReadiness?: DeploymentReadinessSummary;
  deploymentAgent: {
    phase2AgentAvailable: boolean;
    approveEnabled: boolean;
    rollbackEnabled: boolean;
    lockReason: string;
  };
  history: DeploymentHistoryItem[];
}
