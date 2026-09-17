// Генератор Excel-шаблона отчёта заказчику (заселение: Вахтовики / ИТР).
// По образцу из Word «отчет гост». Запуск: node scripts/gen-report-template.mjs [путь.xlsx]
import ExcelJS from "exceljs";

const OUT = process.argv[2] || "C:/Users/User/Downloads/Отчёт заказчику (шаблон).xlsx";
const ROWS = 30; // пустых строк под заполнение

const wb = new ExcelJS.Workbook();
wb.creator = "u2b-cloud-cash";
const ws = wb.addWorksheet("Отчёт", {
  views: [{ showGridLines: false }],
  pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
});

// Столбцы: A=№ | B..E=Вахтовики | F..H=ИТР
ws.mergeCells("A1:A2");
ws.mergeCells("B1:E1");
ws.mergeCells("F1:H1");
ws.getCell("A1").value = "№";
ws.getCell("B1").value = "Вахтовики";
ws.getCell("F1").value = "ИТР";

const sub = [
  "дата и время заселения", "ФИО", "должность", "подразделение", // Вахтовики
  "дата и время заселения", "ФИО", "должность",                   // ИТР
];
["B2", "C2", "D2", "E2", "F2", "G2", "H2"].forEach((addr, i) => (ws.getCell(addr).value = sub[i]));

const widths = [5, 20, 26, 18, 20, 20, 26, 18];
widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));

const thin = { style: "thin", color: { argb: "FF000000" } };
const border = { top: thin, left: thin, bottom: thin, right: thin };
const lastRow = 2 + ROWS;

for (let r = 1; r <= lastRow; r++) {
  for (let c = 1; c <= 8; c++) {
    const cell = ws.getCell(r, c);
    cell.border = border;
    if (r <= 2) {
      cell.font = { bold: true, size: 11 };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
    } else {
      cell.alignment = { vertical: "middle", horizontal: c === 1 ? "center" : "left", wrapText: true };
    }
  }
}
ws.getRow(1).height = 22;
ws.getRow(2).height = 42;
for (let i = 1; i <= ROWS; i++) ws.getCell(2 + i, 1).value = i; // нумерация строк

await wb.xlsx.writeFile(OUT);
console.log("✔ Готово:", OUT);
