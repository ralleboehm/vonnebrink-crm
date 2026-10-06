function formatFileSize(bytes) {

    if (!bytes || bytes === 0) {
        return "0 B";
    }

    const units = ["B", "KB", "MB", "GB", "TB"];

    const index = Math.floor(
        Math.log(bytes) / Math.log(1024)
    );

    const value = bytes / Math.pow(1024, index);

    return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;

}

module.exports = formatFileSize;