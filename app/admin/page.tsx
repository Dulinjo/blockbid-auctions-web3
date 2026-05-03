"use client";

import { useEffect, useState } from "react";
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

type SurveySummary = {
  total_responses: number;
  likert_averages: Record<string, number | null>;
  dimension_averages: Record<string, number | null>;
  distributions: Record<string, Record<string, number>>;
  most_common_error_types: Array<{ error_type: string; count: number }>;
  recent_open_feedback: Array<{
    id: string;
    timestamp: string;
    q38_most_useful_part: string;
    q39_improvement_suggestion: string;
    q40_missing_information: string;
  }>;
};

type SurveyAdminPayload = {
  total_count: number;
  summary: SurveySummary;
  responses: Array<Record<string, unknown>>;
};

export default function AdminPage() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [uploadFailures, setUploadFailures] = useState<UploadFailure[]>([]);
  const [reindexResult, setReindexResult] = useState<ReindexResult | null>(null);
  const [surveyData, setSurveyData] = useState<SurveyAdminPayload | null>(null);
  const [loadingSurveys, setLoadingSurveys] = useState(false);
  const [selectedSurvey, setSelectedSurvey] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canUpload = files.length > 0 && !uploading;

  const loadSurveys = async () => {
    setLoadingSurveys(true);
    try {
      const response = await fetch("/api/admin/surveys");
      if (!response.ok) {
        throw new Error("Neuspešno učitavanje rezultata ankete.");
      }
      const payload = (await response.json()) as SurveyAdminPayload;
      setSurveyData(payload);
    } catch (surveyError) {
      setError(surveyError instanceof Error ? surveyError.message : "Greška pri učitavanju anketa.");
    } finally {
      setLoadingSurveys(false);
    }
  };

  useEffect(() => {
    void loadSurveys();
  }, []);

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

      <Card className="border-white/20 bg-slate-900/70 backdrop-blur-md">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-slate-100">Rezultati ankete</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" onClick={loadSurveys} disabled={loadingSurveys}>
              {loadingSurveys ? "Učitavanje..." : "Osveži"}
            </Button>
            <a href="/api/admin/surveys.csv" className="inline-flex">
              <Button variant="outline">Preuzmi CSV</Button>
            </a>
            <a href="/api/admin/surveys.json" className="inline-flex">
              <Button variant="outline">Preuzmi JSON</Button>
            </a>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-200">
            Ukupno podnetih anketa:{" "}
            <span className="font-semibold">{surveyData?.total_count ?? 0}</span>
          </p>
          {surveyData?.summary ? (
            <div className="grid gap-2 md:grid-cols-2">
              {Object.entries(surveyData.summary.dimension_averages).map(([key, value]) => (
                <div key={key} className="rounded-md border border-white/10 bg-slate-800/60 p-2 text-xs text-slate-200">
                  <span className="font-semibold">{key}:</span>{" "}
                  {value === null ? "n/a" : value.toFixed(2)}
                </div>
              ))}
            </div>
          ) : null}
          {surveyData?.responses?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-200">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="px-2 py-1">ID</th>
                    <th className="px-2 py-1">Vreme</th>
                    <th className="px-2 py-1">Uloga</th>
                    <th className="px-2 py-1">Q31</th>
                    <th className="px-2 py-1">Q32</th>
                    <th className="px-2 py-1">Akcija</th>
                  </tr>
                </thead>
                <tbody>
                  {surveyData.responses.slice(0, 40).map((row) => (
                    <tr key={String(row.id ?? Math.random())} className="border-b border-white/5">
                      <td className="px-2 py-1">{String(row.id ?? "")}</td>
                      <td className="px-2 py-1">{String(row.timestamp ?? "")}</td>
                      <td className="px-2 py-1">{String(row.q01_professional_role ?? "")}</td>
                      <td className="px-2 py-1">{String(row.q31_overall_satisfaction ?? "")}</td>
                      <td className="px-2 py-1">{String(row.q32_met_expectations ?? "")}</td>
                      <td className="px-2 py-1">
                        <Button variant="outline" onClick={() => setSelectedSurvey(row)}>
                          Detalji
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Još nema podnetih anketa.</p>
          )}
          {surveyData?.summary?.recent_open_feedback?.length ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-100">Skorašnji komentari</h3>
              {surveyData.summary.recent_open_feedback.slice(0, 8).map((item) => (
                <div key={item.id} className="rounded-md border border-white/10 bg-slate-800/50 p-2 text-xs text-slate-200">
                  <p><span className="font-semibold">Najkorisnije:</span> {item.q38_most_useful_part || "—"}</p>
                  <p><span className="font-semibold">Unapređenje:</span> {item.q39_improvement_suggestion || "—"}</p>
                  <p><span className="font-semibold">Nedostaje:</span> {item.q40_missing_information || "—"}</p>
                </div>
              ))}
            </div>
          ) : null}
          {selectedSurvey ? (
            <div className="rounded-md border border-cyan-400/30 bg-cyan-900/20 p-3 text-xs text-cyan-100">
              <div className="mb-2 flex items-center justify-between">
                <p className="font-semibold">Detalji odgovora</p>
                <Button variant="outline" onClick={() => setSelectedSurvey(null)}>
                  Zatvori
                </Button>
              </div>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap">
                {JSON.stringify(selectedSurvey, null, 2)}
              </pre>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
