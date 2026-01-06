function listStatementCsvFiles(folderId, latestOnly) {
  const folder = DriveApp.getFolderById(folderId);
  const files = folder.getFiles();

  const all = [];
  while (files.hasNext()) {
    const f = files.next();
    const name = (f.getName() || "").toLowerCase();
    if (!name.endsWith(".csv")) continue;
    all.push(f);
  }
  if (all.length === 0) return [];

  if (!latestOnly) return all;

  all.sort((a, b) => b.getLastUpdated().getTime() - a.getLastUpdated().getTime());
  return [all[0]];
}
