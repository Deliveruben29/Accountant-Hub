/// <reference lib="dom" />
// Declare File and Blob types for Node.js compatibility
declare global {
  interface File extends Blob {
    readonly name: string;
    readonly lastModified: number;
    readonly webkitRelativePath?: string;
  }

  interface Blob {
    readonly size: number;
    readonly type: string;
    slice(start?: number, end?: number, contentType?: string): Blob;
    stream(): ReadableStream<Uint8Array>;
    text(): Promise<string>;
    arrayBuffer(): Promise<ArrayBuffer>;
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
