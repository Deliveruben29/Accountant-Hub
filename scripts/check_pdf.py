import pdfplumber
import sys

def extract_pdf(path, out_file, pages=1):
    out_file.write(f"--- Extracting {path} (first {pages} pages) ---\n")
    try:
        with pdfplumber.open(path) as pdf:
            for i in range(min(pages, len(pdf.pages))):
                page = pdf.pages[i]
                text = page.extract_text()
                if text:
                    out_file.write(f"Page {i+1}:\n")
                    out_file.write(text + "\n")
                out_file.write("-" * 40 + "\n")
    except Exception as e:
        out_file.write(f"Error reading {path}: {e}\n")

if __name__ == "__main__":
    postfinance_path = "c:/TBF_Apps/Accountant-Hub/attached_assets/REP_P_CH1909000000166315131_1120012465_0_2025060104062229_1773592725266.pdf"
    cornercard_path = "c:/TBF_Apps/Accountant-Hub/attached_assets/TBF_LibroDeCaja_-_CornerCard_1773583950205.pdf"
    
    with open("c:/TBF_Apps/Accountant-Hub/scripts/pdf_res.txt", "w", encoding="utf-8") as f:
        extract_pdf(postfinance_path, f, 2)
        extract_pdf(cornercard_path, f, 2)

