export type FileStatus = "pending" | "active" | "deleted";

export interface FileRow {
  id: string;
  token_hash: string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  expires_at: string | null;
  is_permanent: boolean;
  status: FileStatus;
  download_count: number;
  max_downloads: number | null;
}

export interface ConsumeDownloadRow {
  id: string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  download_count: number;
  max_downloads: number | null;
  is_permanent: boolean;
}
