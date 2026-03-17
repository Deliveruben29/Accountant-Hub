/**
 * Global type declarations for Node.js environments
 * Provides File and Blob types for zod validation
 */

declare global {
  interface File extends Blob {
    readonly name: string;
    readonly lastModified: number;
  }

  interface Blob {
    readonly size: number;
    readonly type: string;
    slice(start?: number, end?: number, contentType?: string): Blob;
  }

  var File: {
    prototype: File;
    new(blobParts: BlobPart[], filename: string, options?: FilePropertyBag): File;
  };

  var Blob: {
    prototype: Blob;
    new(blobParts?: BlobPart[], options?: BlobPropertyBag): Blob;
  };
}

type BlobPart = BufferSource | Blob | string;

interface BlobPropertyBag {
  type?: string;
  endings?: "transparent" | "native";
}

interface FilePropertyBag extends BlobPropertyBag {
  lastModified?: number;
}

export {};
