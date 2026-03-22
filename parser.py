import pdfplumber
import re
from datetime import datetime
from database import guess_category, get_engine, get_session, init_db, Transaction

class PostFinanceParser:
    def __init__(self):
        self.transactions = []

    def is_transaction_start(self, line):
        # PostFinance lines usually start with DD.MM.YY and KAUF/DIENSTLEISTUNG, LASTSCHRIFT or BARGELDBEZUG
        match = re.search(r'^(\d{2}\.\d{2}\.\d{2})\s+(KAUF/DIENSTLEISTUNG|LASTSCHRIFT|BARGELDBEZUG|GUTSCHRIFT)', line)
        if match:
            return True, match
        return False, None

    def extract_amount_date(self, line):
         # Extract the amount which is usually before the Valuta date at the end of the line
        # E.g: "LASTSCHRIFT 21.50 01.05.25" or "KAUF/DIENSTLEISTUNG VOM 30.04.2025 11.80 30.04.25"
        # Sometimes there's a balance at the very end e.g. "... 13.50 02.05.25 1 812.45"
        parts = line.split()
        
        # Try to find the valuta date (DD.MM.YY) near the end
        valuta_idx = -1
        for i, part in enumerate(reversed(parts)):
            if re.match(r'^\d{2}\.\d{2}\.\d{2}$', part):
                valuta_idx = len(parts) - 1 - i
                break
                
        if valuta_idx > 0:
            amount_str = parts[valuta_idx - 1].replace("'", "")
            try:
                amount = float(amount_str)
                return amount
            except ValueError:
                pass
        return 0.0

    def parse(self, pdf_path):
        current_tx = None
        buffer_lines = []
        
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if not text: continue
                
                lines = text.split('\n')
                for line in lines:
                    line = line.strip()
                    if not line: continue
                    
                    is_start, match = self.is_transaction_start(line)
                    
                    if is_start:
                        # Save previous transaction
                        if current_tx:
                            self.process_transaction(current_tx, buffer_lines)
                        
                        date_str = match.group(1)
                        tx_type_raw = match.group(2)
                        
                        date_obj = datetime.strptime(date_str, "%d.%m.%y").date()
                        amount = self.extract_amount_date(line)
                        
                        tx_type = 'Expense' if tx_type_raw in ['KAUF/DIENSTLEISTUNG', 'LASTSCHRIFT', 'BARGELDBEZUG'] else 'Income'
                        if tx_type == 'Expense': amount = -amount
                        
                        current_tx = {
                            'date': date_obj,
                            'amount': amount,
                            'type': tx_type,
                            'raw_start_line': line
                        }
                        buffer_lines = []
                    elif current_tx:
                        # Append to buffer until next transaction
                        # Skip page headers or footers
                        if "Kontoauszug" in line or "IBAN CH19" in line or "Kontonummer" in line or "--------" in line or "Datum Text" in line or "Seite" in line:
                            continue
                        buffer_lines.append(line)
                        
        # Save last transaction
        if current_tx:
            self.process_transaction(current_tx, buffer_lines)
            
        return self.transactions

    def process_transaction(self, tx, buffer_lines):
        if not buffer_lines:
            tx['merchant'] = "Unknown"
            tx['city'] = ""
            tx['long_reference_metadata'] = tx['raw_start_line']
            self.transactions.append(tx)
            return

        merchant = ""
        city = ""
        meta = [tx['raw_start_line']] + buffer_lines
        
        # Simple heuristic:
        # If line contains "KARTEN NR.", the next line is usually merchant, next is city
        karten_idx = -1
        for i, line in enumerate(buffer_lines):
            if "KARTEN NR." in line:
                karten_idx = i
                break
                
        if karten_idx != -1 and karten_idx + 1 < len(buffer_lines):
            merchant = buffer_lines[karten_idx + 1]
            if karten_idx + 2 < len(buffer_lines):
                city = buffer_lines[karten_idx + 2]
        else:
            # Maybe it's a LASTSCHRIFT. Usually lines 2 or 3 have the company name.
            if len(buffer_lines) > 2 and "CH9" in buffer_lines[2]: # IBAN line
                if len(buffer_lines) > 3:
                    merchant = buffer_lines[3]
                if len(buffer_lines) > 4:
                    city = buffer_lines[4]
            elif len(buffer_lines) > 0:
                merchant = buffer_lines[0]

        tx['merchant'] = merchant.strip()
        tx['city'] = city.strip()
        tx['long_reference_metadata'] = "\n".join(meta)
        
        # Clean merchant name a bit if it has trailing parts
        # e.g., "COOP-5307 ZH HAUPTBAHNHOF TO GO" -> "COOP" or just use guess_category
        tx['category'] = guess_category(tx['merchant'], tx['long_reference_metadata'])
        
        self.transactions.append(tx)

class CornerCardParser:
    def __init__(self):
        self.transactions = []
        
    def parse(self, pdf_path):
        # CornerCard is structured in two lines per row
        # Line 1: ID Date Month Concept Category
        # Line 2: Entity/Provider Amount
        
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if not text: continue
                lines = text.split('\n')
                
                i = 0
                while i < len(lines):
                    line1 = lines[i].strip()
                    # Check if it looks like a CornerCard transaction ID
                    if line1.startswith("TBF-"):
                        if i + 1 < len(lines):
                            line2 = lines[i+1].strip()
                            self.process_pair(line1, line2)
                            i += 2
                            continue
                    i += 1
        return self.transactions

    def process_pair(self, line1, line2):
        # Parse Line 1: TBF-001 30/5/2025 mayo Card reload Transfer
        parts1 = line1.split()
        if len(parts1) < 2: return
        
        date_str = parts1[1]
        try:
            date_obj = datetime.strptime(date_str, "%d/%m/%Y").date()
        except Exception:
            try:
                date_obj = datetime.strptime(date_str, "%d/%m/%y").date()
            except Exception:
                date_obj = datetime.now().date()
                
        # Parse Line 2: Card reload -CHF50.00
        # Split by CHF to isolate amount
        merchant = ""
        amount = 0.0
        
        import re
        amt_match = re.search(r'(-?CHF\s*[\d\.]+)', line2)
        if amt_match:
            amount_str = amt_match.group(1).replace('CHF', '').strip()
            amount = float(amount_str)
            merchant = line2[:amt_match.start()].strip()
        else:
            merchant = line2

        tx_type = 'Expense' if amount < 0 else 'Income'
        category = guess_category(merchant, line1)
        
        self.transactions.append({
            'date': date_obj,
            'amount': amount,
            'type': tx_type,
            'merchant': merchant,
            'city': "",
            'category': category,
            'long_reference_metadata': f"{line1}\n{line2}"
        })

class CornerCardExcelParser:
    def __init__(self):
        self.transactions = []

    def parse(self, excel_path):
        import pandas as pd
        df = pd.read_excel(excel_path)
        
        for index, row in df.iterrows():
            if pd.isna(row.get('Date')) or pd.isna(row.get('Amount')):
                continue
            
            try:
                if isinstance(row['Date'], datetime):
                    date_obj = row['Date'].date()
                else:
                    date_obj = pd.to_datetime(row['Date']).date()
            except Exception:
                continue

            amount = float(row['Amount'])
            merchant = str(row.get('Description', '')).strip()
            
            tx_type = 'Expense' if amount < 0 else 'Income'
            category = guess_category(merchant, f"Status: {row.get('Status', '')} Card: {row.get('Card', '')}")
            
            self.transactions.append({
                'date': date_obj,
                'amount': amount,
                'type': tx_type,
                'merchant': merchant,
                'city': "",
                'category': category,
                'long_reference_metadata': f"Card: {row.get('Card', '')}\nCurrency: {row.get('Currency', '')}\nStatus: {row.get('Status', '')}"
            })

        return self.transactions

def ingest_file(file_path, account_source, original_filename, user_id):
    from database import UploadedFile
    import os
    
    engine = get_engine()
    session = get_session(engine)
    
    is_excel = file_path.lower().endswith(('.xlsx', '.xls'))
    
    if account_source == "PostFinance":
        parser = PostFinanceParser()
    elif account_source == "CornerCard":
        if is_excel:
            parser = CornerCardExcelParser()
        else:
            parser = CornerCardParser()
    else:
        raise ValueError("Unknown account source")
        
    txs = parser.parse(file_path)
    
    # 1. Register UploadedFile
    file_size = os.path.getsize(file_path)
    new_file = UploadedFile(
        filename=original_filename,
        file_size=file_size,
        account_source=account_source,
        uploaded_by=user_id
    )
    session.add(new_file)
    session.flush() # get new_file.id
    
    # 2. Add Transactions
    added = 0
    for tx_data in txs:
        # Check if exists by date, amount and merchant for the same user
        exists = session.query(Transaction).filter_by(
            date=tx_data['date'],
            amount=tx_data['amount'],
            merchant=tx_data['merchant'],
            user_id=user_id
        ).first()
        
        if not exists:
            tx = Transaction(
                date=tx_data['date'],
                amount=tx_data['amount'],
                type=tx_data['type'],
                merchant=tx_data['merchant'],
                city=tx_data['city'],
                category=tx_data['category'],
                account_source=account_source,
                long_reference_metadata=tx_data['long_reference_metadata'],
                file_id=new_file.id,
                user_id=user_id
            )
            session.add(tx)
            added += 1
            
    session.commit()
    return added


import os

if __name__ == "__main__":
    init_db(get_engine())
    # Mock user_id 1 (admin)
    base_dir = os.path.dirname(__file__)
    postfinance_pdf = os.path.join(base_dir, "attached_assets", "REP_P_CH1909000000166315131_1120012465_0_2025060104062229_1773592725266.pdf")
    cornercard_pdf = os.path.join(base_dir, "attached_assets", "TBF_LibroDeCaja_-_CornerCard_1773583950205.pdf")
    ingest_file(postfinance_pdf, "PostFinance", "Postfinance_test.pdf", 1)
    ingest_file(cornercard_pdf, "CornerCard", "Cornercard_test.pdf", 1)
