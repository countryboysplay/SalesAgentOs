/**
 * SalesTrack — persistence layer barrel.
 *
 * The app store (`src/app/store.tsx`) should import from here and nowhere
 * deeper. Exports are listed explicitly rather than star-exported so the public
 * surface of the data layer is visible in one place, and so the layer's private
 * date/id helpers do not leak into the rest of the app — `src/core/date.ts` is
 * the app-wide home for that.
 */

// --- Schema, connection and device storage ---------------------------------
export {
  DB_NAME,
  DB_VERSION,
  SCHEMA_VERSION,
  StorageError,
  closeDatabase,
  defaultCategories,
  defaultProfile,
  defaultSettings,
  destroyDatabase,
  getDB,
  isIndexedDbAvailable,
  isStorageError,
  requestPersistentStorage,
  storageEstimate,
  toStorageError,
} from './db'
export type {
  OpenOptions,
  PersistenceStatus,
  SalesTrackDB,
  SalesTrackDatabase,
  StorageEstimateResult,
  StorageErrorCode,
  StoreName,
} from './db'

// --- CRUD -------------------------------------------------------------------
export {
  cancelSale,
  computeCommission,
  countSales,
  createCategory,
  createSale,
  deactivateCategory,
  deleteCategory,
  deleteSale,
  disableGoal,
  getSale,
  listCategories,
  listGoals,
  listSales,
  loadAll,
  loadSettings,
  recentCategories,
  resolveCommissionRate,
  restoreSale,
  restoreSales,
  salesByStatusInRange,
  salesDateRange,
  salesInRange,
  saveProfile,
  saveSettings,
  setGoal,
  uncancelSale,
  updateCategory,
  updateSale,
} from './repository'
export type { AppData, CategoryDeleteResult, CategoryUpdate, NewCategoryInput, SaleUpdate } from './repository'

// --- Backup, restore, reset -------------------------------------------------
export {
  APP_VERSION,
  BACKUP_FORMAT,
  BACKUP_VERSION,
  BackupValidationError,
  backupFilename,
  createBackup,
  downloadBackup,
  isBackupValidationError,
  markBackupCreated,
  parseBackup,
  readBackupFile,
  resetAllData,
  restoreBackup,
  serializeBackup,
  storageHealth,
  summarizeBackup,
  validateBackup,
} from './backup'
export type { DownloadResult, ResetResult, RestoreResult, StorageHealth } from './backup'

// --- CSV export (NOT a backup — see csv.ts and spec §41) --------------------
export {
  CSV_COLUMNS,
  csvFilename,
  downloadSalesCsv,
  escapeCsvCell,
  exportSalesCsv,
  formatBasisPointsPlain,
  formatCentsPlain,
  parseCsv,
} from './csv'
