const fs = require("fs");
const path = require("path");

const baseSchemaPath = path.join(__dirname, "base.prisma");
const modelsDir = path.join(__dirname, "models");
const outputSchemaPath = path.join(__dirname, "schema.prisma");

const baseSchema = fs.readFileSync(baseSchemaPath, "utf-8");

const modelFiles = fs
  .readdirSync(modelsDir)
  .filter((file) => file.endsWith(".prisma"));

let combinedModels = "";
modelFiles.forEach((file) => {
  const modelContent = fs.readFileSync(path.join(modelsDir, file), "utf-8");
  combinedModels += `\n\n// ${file}\n${modelContent}`;
});

const finalSchema = baseSchema + combinedModels;
fs.writeFileSync(outputSchemaPath, finalSchema);

console.log("schema.prisma generated successfully!");
