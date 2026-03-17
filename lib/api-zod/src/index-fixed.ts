// Re-export everything from generated API, but with proper type polyfills
export * from "./generated/types";

// Import the raw generated API
import * as GeneratedAPI from "./generated/api";

// Polyfill File and Blob for Node.js environments if they don't exist
if (typeof global !== "undefined") {
  if (!global.File) {
    (global as any).File = class File {
      constructor(
        public parts: any[],
        public name: string,
        public options?: any
      ) {}
    };
  }
  if (!global.Blob) {
    (global as any).Blob = class Blob {
      constructor(public parts: any[], public options?: any) {}
    };
  }
}

// Re-export all generated API exports
export const {
  BeginBrowserLoginQueryParams,
  HandleBrowserLoginCallbackQueryParams,
  LogoutBrowserSessionHeader,
  HealthCheckResponse,
  listAccountsResponseCurrencyDefault,
  ListAccountsResponseItem,
  ListAccountsResponse,
  createAccountBodyCurrencyDefault,
  createAccountBodyBalanceDefault,
  CreateAccountBody,
  DeleteAccountParams,
  listTransactionsQueryLimitDefault,
  listTransactionsQueryOffsetDefault,
  ListTransactionsQueryParams,
  listTransactionsResponseDataItemImportedFromStatementDefault,
  ListTransactionsResponse,
  CreateTransactionBody,
  UpdateTransactionParams,
  UpdateTransactionBody,
  updateTransactionResponseImportedFromStatementDefault,
  UpdateTransactionResponse,
  DeleteTransactionParams,
  createTransactionResponse,
  UpdateTransactionResponse: UpdateTransactionResponse2,
  CreateStatementImportProgressResponse,
  ListStatementImportsResponse,
  DeleteStatementImportParams,
  DeleteStatementImportQueryParams,
  UploadStatementBody,
  UploadStatementResponse,
  GetTransactionsQueryParams,
  GetTransactionsResponse,
  RecalculateAccountParams,
  RecalculateAccountResponse,
} = GeneratedAPI;
