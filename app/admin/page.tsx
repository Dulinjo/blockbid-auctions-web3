"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, RefreshCcw, FileText, CheckCircle2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type UploadResult = {
  status: string;
  filename: string;
  chunks_added: number;
};

type UploadFailure = {
  filename: string;
  reason: string;
};

type ReindexResult = {
  status: string;
  chunks_indexed: number;
  files_processed: number;
};

export default function AdminPage() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [uploadFailures, setUploadFailures] = useState<UploadFailure[]>([]);
  const [reindexResult, setReindexResult] = useState<ReindexResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canUpload = files.length > 0 && !uploading;

  const logout = async () => {
    await fetch("/admin/logout/api", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  };

  const parseError = async (response: Response, fallbackMessage: string): Promise<string> => {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const payload = (await response.json().catch(() => null)) as
        | { detail?: string; error?: string }
        | null;
      return payload?.detail ?? payload?.error ?? fallbackMessage;
    }

    const textPayload = await response.text().catch(() => "");
    return textPayload.trim() || fallbackMessage;
  };

  const upload = async () => {
    if (files.length === 0) {
      return;
    }

    setUploading(true);
    setError(null);
    setUploadResults([]);
    setUploadFailures([]);
    const successfulUploads: UploadResult[] = [];
    const failedUploads: UploadFailure[] = [];

    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const reason = await parseError(
            response,
            `Otpremanje nije uspelo za fajl ${file.name}.`,
          );
          failedUploads.push({ filename: file.name, reason });
          continue;
        }

        const data = (await response.json()) as UploadResult;
        successfulUploads.push(data);
      }

      setUploadResults(successfulUploads);
      setUploadFailures(failedUploads);
      setFiles([]);

      if (failedUploads.length > 0 && successfulUploads.length === 0) {
        setError("Nijedan dokument nije uspešno otpremljen.");
      } else if (failedUploads.length > 0) {
        setError("Neki dokumenti nisu uspešno otpremljeni.");
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Nepoznata greška.");
    } finally {
      setUploading(false);
    }
  };

  const reindex = async () => {
    setReindexing(true);
    setError(null);
    setReindexResult(null);
    try {
      const response = await fetch("/api/reindex", { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail ?? "Reindeksiranje nije uspelo.");
      }
      const data = (await response.json()) as ReindexResult;
      setReindexResult(data);
    } catch (reindexError) {
      setError(reindexError instanceof Error ? reindexError.message : "Nepoznata greška.");
    } finally {
      setReindexing(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-slate-100">LexVibe Admin Dashboard</h1>
        <Button variant="outline" onClick={logout}>
          <LogOut className="mr-2 h-4 w-4" />
          Odjava
        </Button>
      </header>

      <Card className="border-white/20 bg-slate-900/70 backdrop-blur-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <UploadCloud className="h-5 w-5 text-cyan-300" />
            Upravljanje dokumentima
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="block text-sm text-slate-300">
            Izaberite dokumente (PDF, DOCX, ODT)
            <Input
              type="file"
              accept=".pdf,.docx,.odt"
              multiple
              onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
              className="mt-2 bg-slate-800/80 text-slate-100"
            />
          </label>
          {files.length > 0 ? (
            <p className="text-xs text-slate-300/90">Izabrano fajlova: {files.length}</p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button onClick={upload} disabled={!canUpload}>
              {uploading ? "Otpremanje..." : "Otpremi dokumente"}
            </Button>
            <Button variant="outline" onClick={reindex} disabled={reindexing}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              {reindexing ? "Reindeksiranje..." : "Re-index"}
            </Button>
          </div>
          {uploadResults.length > 0 ? (
            <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4" />
                Upload uspešan ({uploadResults.length})
              </div>
              <ul className="mt-2 space-y-1">
                {uploadResults.map((result) => (
                  <li key={result.filename}>
                    <span className="font-semibold">{result.filename}</span> · indeksiranih chunk-ova:{" "}
                    {result.chunks_added}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {uploadFailures.length > 0 ? (
            <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">
              <p className="font-medium">Neuspešni upload-i ({uploadFailures.length})</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {uploadFailures.map((failure) => (
                  <li key={`${failure.filename}-${failure.reason}`}>
                    <span className="font-semibold">{failure.filename}</span>: {failure.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {reindexResult ? (
            <div className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 p-3 text-sm text-cyan-100">
              <div className="flex items-center gap-2 font-medium">
                <FileText className="h-4 w-4" />
                Re-index završen
              </div>
              <p className="mt-1">
                Obrađeno dokumenata: {reindexResult.files_processed} · ukupno chunk-ova:{" "}
                {reindexResult.chunks_indexed}
              </p>
            </div>
          ) : null}
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
        </CardContent>
      </Card>
    </main>
  );
}
