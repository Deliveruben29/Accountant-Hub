import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import { UploadCloud, FileText, CheckCircle2, ArrowRight, Loader2 } from "lucide-react";
import { 
  useUploadStatement,
  useListAccounts,
  StatementUploadResponse
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListTransactionsQueryKey, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/format";

export default function UploadStatement() {
  const { data: accounts, isLoading: accountsLoading } = useListAccounts();
  const uploadMutation = useUploadStatement();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [file, setFile] = useState<File | null>(null);
  const [accountId, setAccountId] = useState<string>("");
  const [result, setResult] = useState<StatementUploadResponse | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setResult(null); // Clear previous results
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive, isDragReject, open } = useDropzone({ 
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/pdf': ['.pdf']
    },
    maxFiles: 1,
    noClick: true,
  });

  const handleUpload = async () => {
    if (!file || !accountId) return;
    
    try {
      const response = await uploadMutation.mutateAsync({
        data: {
          file,
          accountId: Number(accountId)
        }
      });
      
      setResult(response);
      queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      
      toast({ title: "Statement uploaded successfully" });
    } catch (error) {
      toast({ title: "Failed to upload statement", variant: "destructive" });
    }
  };

  const resetUpload = () => {
    setFile(null);
    setResult(null);
  };

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
                        {accounts?.map(acc => (
                          <SelectItem key={acc.id} value={String(acc.id)}>{acc.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div 
                  {...getRootProps()} 
                  className={`
                    border-2 border-dashed rounded-2xl p-12 transition-all duration-300 flex flex-col items-center justify-center text-center cursor-pointer min-h-[300px]
                    ${isDragActive ? 'border-primary bg-primary/5' : 'border-border/60 hover:border-primary/50 hover:bg-muted/30'}
                    ${isDragReject ? 'border-destructive bg-destructive/5' : ''}
                    ${!accountId ? 'opacity-50 pointer-events-none' : ''}
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
                      <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <UploadCloud className={`w-8 h-8 ${isDragActive ? 'text-primary' : 'text-muted-foreground'}`} />
                      </div>
                      <h3 className="text-xl font-bold text-foreground mb-2">
                        {isDragActive ? "Drop file here" : "Drag & drop your statement"}
                      </h3>
                      <p className="text-muted-foreground max-w-xs mb-6">
                        Support for PDF and CSV bank statements. We'll automatically extract and categorize transactions.
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
                    {uploadMutation.isPending ? "Processing..." : "Import Transactions"}
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
                  Successfully imported {result.imported} transactions. {result.skipped > 0 && `${result.skipped} skipped.`}
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
                      <div className={`font-semibold font-mono ${
                        tx.type === 'income' ? 'text-emerald-600' : 'text-rose-600'
                      }`}>
                        {formatCurrency(tx.amount)}
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
    </div>
  );
}
