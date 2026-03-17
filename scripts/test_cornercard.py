import sys
sys.path.append("c:/TBF_Apps/Accountant-Hub")
from parser import CornerCardParser

path = "c:/TBF_Apps/Accountant-Hub/attached_assets/TBF_LibroDeCaja_-_CornerCard_1773583950205.pdf"

parser = CornerCardParser()
txs = parser.parse(path)

print(f"Extracted {len(txs)} transactions.")
for t in txs[:5]:
    print(t)
