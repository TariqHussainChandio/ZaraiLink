export type ReportTargetType = 'product' | 'user' | 'review' | 'message' | 'expert' | 'listing';
export type ReportStatus = 'open' | 'investigating' | 'resolved' | 'dismissed';

export interface Report {
  id: string;
  reporter_id: string;
  target_type: ReportTargetType;
  target_id: string;
  reason: string;
  status: ReportStatus;
  resolution_notes: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface ReportWithReporter extends Report {
  reporter: { id: string; full_name: string } | null;
}
