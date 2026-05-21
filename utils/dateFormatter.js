// Format Date in DD-MM-YYYY format with time in HH:MM format
const formatDateTime = (date = new Date()) => {
    const pad = (n) => n.toString().padStart(2, "0");

    const day = pad(date.getDate());
    const month = pad(date.getMonth() + 1);
    const year = date.getFullYear();

    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());

    return `${day}-${month}-${year} ${hours}:${minutes}`;
}

// Format Date in YYYYMMDD_HHMM format for file naming
function formatDateForFile(date = new Date()) {
  const pad = (n) => n.toString().padStart(2, "0");

  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
}

// Format Date in DD-MM-YYYY format
const formatDate = (date) => {
    if (!date) return "N/A";

    const d = new Date(date);

    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();

    return `${day}-${month}-${year}`;
};


module.exports = {
    formatDateTime,
    formatDateForFile,
    formatDate
}