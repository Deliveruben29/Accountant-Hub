import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import { UploadCloud, FileText, CheckCircle2, ArrowRight, Loader2, Trash2, History, CalendarRange, Hash } from "lucide-react";
import {
  useUploadStatement,
  useListAccounts,
  StatementUploadResponse
} from "@workspace/api-client-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { getListTransactionsQueryKey, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface StatementImport {
  id: number;
  accountId: number;
  filename: string;
  txImported: number;
  txSkipped: number;
  dateFrom: string;
  dateTo: string;
  importedAt: string;
}

function useStatementImports(accountId?: number) {
  return useQuery<StatementImport[]>({
    queryKey: ["statement-imports", accountId],
    queryFn: async () => {
      const url = accountId
        ? `${API_BASE}/api/statement-imports?accountId=${accountId}`
        : `${API_BASE}/api/statement-imports`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch imports");
      return res.json();
    },
  });
}

function useDeleteImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API_BASE}/api/statement-imports/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete import");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["statement-imports"] });
      queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    },
  });
}

export default function UploadStatement() {
  const { data: accounts, isLoading: accountsLoading } = useListAccounts();
  const uploadMutation = useUploadStatement();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [accountId, setAccountId] = useState<string>("");
  const [result, setResult] = useState<StatementUploadResponse | null>(null);

  const { data: imports, isLoading: importsLoading } = useStatementImports();
  const deleteImport = useDeleteImport();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setResult(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive, isDragReject, open } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "application/pdf": [".pdf"],
    },
    maxFiles: 1,
    noClick: true,
  });

  const handleUpload = async () => {
    if (!file || !accountId) return;
    try {
      const response = await uploadMutation.mutateAsync({
        data: { file, accountId: Number(accountId) },
      });
      setResult(response);
      queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["statement-imports"] });
      toast({ title: "Statement uploaded successfully" });
    } catch {
      toast({ title: "Failed to upload statement", variant: "destructive" });
    }
  };

  const handleDelete = async (importId: number, filename: string) => {
    try {
      await deleteImport.mutateAsync(importId);
      toast({ title: `Import "${filename}" deleted`, description: "All linked transactions have been removed." });
    } catch {
      toast({ title: "Failed to delete import", variant: "destructive" });
    }
  };

  const resetUpload = () => {
    setFile(null);
    setResult(null);
  };

  const accountMap = Object.fromEntries((accounts ?? []).map((a) => [a.id, a.name]));

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Upload Statement</h1>
        <p className="text-muted-foreground mt-1">Import transactions automatically from bank statements.</p>
      </div>

      <AnimatePresence mode="wait">
        {!result ? (
          <motion.div
            key="upload-form"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <Card className="shadow-lg border-border/50">
              <CardContent className="p-8 flex flex-col gap-8">
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-foreground">Target Account</label>
                  {accountsLoading ? (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm h-10">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading accounts…
                    </div>
                  ) : accounts && accounts.length === 0 ? (
                    <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3 text-sm max-w-md">
                      <span className="text-amber-700 dark:text-amber-400 font-medium">No accounts found.</span>
                      <a href="/accounts" className="text-primary underline underline-offset-2 hover:no-underline font-medium">
                        Create one first →
                      </a>
                    </div>
                  ) : (
                    <Select value={accountId} onValueChange={setAccountId}>
                      <SelectTrigger className="max-w-md bg-card">
                        <SelectValue placeholder="Select an account to import to" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts?.map((acc) => (
                          <SelectItem key={acc.id} value={String(acc.id)}>{acc.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div
                  {...getRootProps()}
                  className={`
                    border-2 border-dashed rounded-2xl p-12 transition-all duration-300 flex flex-col items-center justify-center text-center cursor-pointer min-h-[260px]
                    ${isDragActive ? "border-primary bg-primary/5" : "border-border/60 hover:border-primary/50 hover:bg-muted/30"}
                    ${isDragReject ? "border-destructive bg-destructive/5" : ""}
                    ${!accountId ? "opacity-50 pointer-events-none" : ""}
                  `}
                >
                  <input {...getInputProps()} disabled={!accountId} />
                  {file ? (
                    <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="flex flex-col items-center">
                      <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4">
                        <FileText className="w-8 h-8" />
                      </div>
                      <p className="font-semibold text-lg text-foreground">{file.name}</p>
                      <p className="text-sm text-muted-foreground mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                      <Button variant="ghost" size="sm" className="mt-4 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); setFile(null); }}>
                        Remove File
                      </Button>
                    </motion.div>
                  ) : (
                    <>
                      <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                        <UploadCloud className={`w-8 h-8 ${isDragActive ? "text-primary" : "text-muted-foreground"}`} />
                      </div>
                      <h3 className="text-xl font-bold text-foreground mb-2">
                        {isDragActive ? "Drop file here" : "Drag & drop your statement"}
                      </h3>
                      <p className="text-muted-foreground max-w-xs mb-6">
                        Supports PDF and CSV bank statements. We'll automatically extract and categorize transactions.
                      </p>
                      <Button variant="secondary" disabled={!accountId} onClick={(e) => { e.stopPropagation(); open(); }}>
                        Browse Files
                      </Button>
                    </>
                  )}
                </div>

                <div className="flex justify-end pt-4 border-t border-border/50">
                  <Button
                    size="lg"
                    disabled={!file || !accountId || uploadMutation.isPending}
                    onClick={handleUpload}
                    className="w-full sm:w-auto shadow-md"
                  >
                    {uploadMutation.isPending ? "Processing…" : "Import Transactions"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <motion.div
            key="upload-success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <Card className="shadow-lg border-border/50 overflow-hidden">
              <div className="bg-emerald-50 dark:bg-emerald-950/20 p-8 border-b border-border/50 flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold text-emerald-800 dark:text-emerald-400">Import Successful!</h2>
                <p className="text-emerald-600/80 mt-2">
                  Imported {result.imported} transactions.{result.skipped > 0 && ` ${result.skipped} already existed and were skipped.`}
                </p>
              </div>
              <CardContent className="p-0">
                <div className="max-h-[400px] overflow-auto">
                  {result.transactions.map((tx, idx) => (
                    <div key={idx} className="flex items-center justify-between p-4 border-b border-border/30 hover:bg-muted/30">
                      <div>
                        <p className="font-medium text-foreground">{tx.description}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(tx.date)} &bull; {tx.category}</p>
                      </div>
                      <div className={`font-semibold font-mono ${tx.type === "income" ? "text-emerald-600" : "text-rose-600"}`}>
                        {tx.type === "income" ? "+" : "−"}{Math.abs(Number(tx.amount)).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-6 bg-muted/20 flex justify-between items-center">
                  <Button variant="outline" onClick={resetUpload}>Upload Another</Button>
                  <Button variant="default" asChild>
                    <a href="/transactions" className="flex items-center gap-2">View All <ArrowRight className="w-4 h-4" /></a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Statement Import History */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">Import History</h2>
          {imports && imports.length > 0 && (
            <Badge variant="secondary">{imports.length}</Badge>
          )}
        </div>

        {importsLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading history…
          </div>
        ) : !imports || imports.length === 0 ? (
          <Card className="border-border/40">
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              No imports yet. Upload your first bank statement above.
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border/40 overflow-hidden">
            <div className="divide-y divide-border/40">
              {imports.map((imp) => (
                <div key={imp.id} className="flex items-center gap-4 px-5 py-4 hover:bg-muted/20 transition-colors">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate text-sm">{imp.filename}</p>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-xs text-muted-foreground font-medium">
                        {accountMap[imp.accountId] ?? `Account #${imp.accountId}`}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <CalendarRange className="w-3 h-3" />
                        {formatDate(imp.dateFrom)} – {formatDate(imp.dateTo)}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Hash className="w-3 h-3" />
                        {imp.txImported} imported
                        {imp.txSkipped > 0 && `, ${imp.txSkipped} skipped`}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-xs text-muted-foreground hidden sm:block">
                      {new Date(imp.importedAt).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
                    </span>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-8 h-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          disabled={deleteImport.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this import?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete <strong>{imp.txImported}</strong> imported transaction(s) from{" "}
                            <strong>{formatDate(imp.dateFrom)}</strong> to <strong>{formatDate(imp.dateTo)}</strong> for{" "}
                            <strong>{accountMap[imp.accountId] ?? `Account #${imp.accountId}`}</strong>.<br /><br />
                            After deleting, you can re-upload the file to import cleanly.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => handleDelete(imp.id, imp.filename)}
                          >
                            Delete Import
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
