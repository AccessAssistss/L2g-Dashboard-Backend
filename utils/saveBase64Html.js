const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

const BASE_DIR = path.join(__dirname, "../uploads/crif");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const saveBase64Html = (base64Content, filePrefix) => {
  if (!base64Content) return null;

  const buffer = Buffer.from(base64Content, "base64");
  ensureDir(BASE_DIR);

  const fileName = `${filePrefix}_${Date.now()}.html`;
  const filePath = path.join(BASE_DIR, fileName);

  fs.writeFileSync(filePath, buffer);

  return `/uploads/crif/${fileName}`;
}

const htmlToBase64Pdf = (html) => {
  return new Promise((resolve, reject) => {
    const id = Date.now();
    const tmpHtml = path.join("/tmp", `agreement-${id}.html`);
    const tmpPdf = path.join("/tmp", `agreement-${id}.pdf`);

    try {
      fs.writeFileSync(tmpHtml, html, "utf8");

      const command = [
        "wkhtmltopdf",
        "--enable-local-file-access",
        "--disable-smart-shrinking",
        "--margin-top 15mm",
        "--margin-bottom 15mm",
        "--margin-left 15mm",
        "--margin-right 15mm",
        tmpHtml,
        tmpPdf,
      ].join(" ");

      exec(command, { timeout: 30000 }, (err, stdout, stderr) => {
        try {
          if (err) {
            return reject(
              new Error(`wkhtmltopdf failed: ${stderr || err.message}`)
            );
          }

          if (!fs.existsSync(tmpPdf)) {
            return reject(new Error("PDF not generated"));
          }

          const pdfBuffer = fs.readFileSync(tmpPdf);

          resolve(pdfBuffer.toString("base64"));
        } finally {
          if (fs.existsSync(tmpHtml)) fs.unlinkSync(tmpHtml);
          if (fs.existsSync(tmpPdf)) fs.unlinkSync(tmpPdf);
        }
      });
    } catch (e) {
      if (fs.existsSync(tmpHtml)) fs.unlinkSync(tmpHtml);
      if (fs.existsSync(tmpPdf)) fs.unlinkSync(tmpPdf);
      reject(e);
    }
  });
};

module.exports = { saveBase64Html, htmlToBase64Pdf };
