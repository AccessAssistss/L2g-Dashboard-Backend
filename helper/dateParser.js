function parseFlexibleDate(dateStr) {
    if (!dateStr || typeof dateStr !== "string") return null;

    dateStr = dateStr.trim();

    const direct = new Date(dateStr);
    if (!isNaN(direct.getTime())) return direct;

    const sep = dateStr.includes("-") ? "-" : dateStr.includes("/") ? "/" : null;
    if (!sep) return null;

    const parts = dateStr.split(sep).map(p => p.trim());
    if (parts.length !== 3) return null;

    let day, month, year;

    if (parts[0].length === 4) {
        year = Number(parts[0]);
        month = Number(parts[1]);
        day = Number(parts[2]);
    } else {
        day = Number(parts[0]);
        month = Number(parts[1]);
        year = Number(parts[2]);
    }

    if (!year || !month || !day) return null;
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;

    const final = new Date(year, month - 1, day);

    if (
        final.getFullYear() !== year ||
        final.getMonth() !== month - 1 ||
        final.getDate() !== day
    ) {
        return null;
    }

    return final;
}

module.exports = {
    parseFlexibleDate
}