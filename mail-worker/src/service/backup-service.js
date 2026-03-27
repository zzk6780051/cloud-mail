import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';
import KvConst from '../const/kv-const';

const backupService = {

	/**
	 * 导出数据库（D1 + KV）为 JSON 文件
	 */
	async exportDatabase(c) {
		try {
			const tables = [
				'user',
				'account', 
				'email',
				'attachments',
				'star',
				'role',
				'perm',
				'role_perm',
				'setting',
				'reg_key',
				'oauth',
				'verify_record'
			];

			const backup = {
				version: '2.0',
				generatedAt: new Date().toISOString(),
				d1: {
					tables: {},
					indexes: []
				},
				kv: {}
			};

			// 导出 D1 数据库
			for (const table of tables) {
				try {
					// 获取表结构
					const tableInfo = await c.env.db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`).bind(table).first();
					
					// 获取表数据
					const rows = await c.env.db.prepare(`SELECT * FROM ${table}`).all();
					
					backup.d1.tables[table] = {
						schema: tableInfo?.sql || null,
						data: rows.results || []
					};
				} catch (e) {
					console.warn(`Table ${table} not found, skipping...`);
				}
			}

			// 导出索引
			try {
				const indexes = await c.env.db.prepare(`SELECT name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL`).all();
				backup.d1.indexes = indexes.results || [];
			} catch (e) {
				console.warn('Failed to export indexes:', e);
			}

			// 导出 KV 数据
			backup.kv = await this.exportKV(c);

			return JSON.stringify(backup, null, 2);
		} catch (e) {
			console.error('Export database error:', e);
			throw new BizError(t('backupExportFail'));
		}
	},

	/**
	 * 导出 KV 数据
	 */
	async exportKV(c) {
		const kvData = {};

		try {
			// 导出系统设置缓存
			const setting = await c.env.kv.get(KvConst.SETTING, { type: 'json' });
			if (setting) {
				kvData[KvConst.SETTING] = setting;
			}

			// 导出公开 API Token
			const publicKey = await c.env.kv.get(KvConst.PUBLIC_KEY);
			if (publicKey) {
				kvData[KvConst.PUBLIC_KEY] = publicKey;
			}

			// 导出所有用户认证信息
			// 由于 KV 没有列出所有键的API，我们需要从 D1 用户表中获取所有用户ID
			try {
				const users = await c.env.db.prepare(`SELECT user_id FROM user`).all();
				if (users.results) {
					for (const user of users.results) {
						const authInfo = await c.env.kv.get(KvConst.AUTH_INFO + user.user_id, { type: 'json' });
						if (authInfo) {
							kvData[KvConst.AUTH_INFO + user.user_id] = authInfo;
						}
					}
				}
			} catch (e) {
				console.warn('Failed to export user auth info:', e);
			}

			// 导出最近的发件统计（最近30天）
			try {
				const now = new Date();
				for (let i = 0; i < 30; i++) {
					const date = new Date(now);
					date.setDate(date.getDate() - i);
					const dateStr = date.toISOString().split('T')[0];
					const count = await c.env.kv.get(KvConst.SEND_DAY_COUNT + dateStr);
					if (count) {
						kvData[KvConst.SEND_DAY_COUNT + dateStr] = count;
					}
				}
			} catch (e) {
				console.warn('Failed to export send day count:', e);
			}

		} catch (e) {
			console.error('Export KV error:', e);
		}

		return kvData;
	},

	/**
	 * 导入 JSON 文件恢复数据库（D1 + KV）
	 */
	async importDatabase(c, jsonContent) {
		try {
			// 验证文件内容
			if (!jsonContent || typeof jsonContent !== 'string') {
				throw new BizError(t('backupInvalidFile'));
			}

			let backup;
			try {
				backup = JSON.parse(jsonContent);
			} catch (e) {
				throw new BizError(t('backupInvalidFile'));
			}

			// 验证备份格式
			if (!backup.version || (!backup.d1 && !backup.kv)) {
				throw new BizError(t('backupInvalidFile'));
			}

			let d1Result = { successCount: 0, errorCount: 0 };
			let kvResult = { successCount: 0, errorCount: 0 };

			// 导入 D1 数据库
			if (backup.d1) {
				d1Result = await this.importD1(c, backup.d1);
			}

			// 导入 KV 数据
			if (backup.kv) {
				kvResult = await this.importKV(c, backup.kv);
			}

			// 刷新设置缓存
			try {
				const settingService = (await import('./setting-service.js')).default;
				await settingService.refresh(c);
			} catch (e) {
				console.warn('Failed to refresh settings cache:', e);
			}

			return {
				success: true,
				d1: d1Result,
				kv: kvResult
			};
		} catch (e) {
			console.error('Import database error:', e);
			if (e.name === 'BizError') {
				throw e;
			}
			throw new BizError(t('backupImportFail'));
		}
	},

	/**
	 * 导入 D1 数据
	 */
	async importD1(c, d1Data) {
		let successCount = 0;
		let errorCount = 0;

		// 删除所有表
		const tables = Object.keys(d1Data.tables || {});
		for (const table of tables.reverse()) {
			try {
				await c.env.db.prepare(`DROP TABLE IF EXISTS ${table}`).run();
			} catch (e) {
				console.warn(`Failed to drop table ${table}:`, e);
			}
		}

		// 创建表结构
		for (const [tableName, tableData] of Object.entries(d1Data.tables || {})) {
			if (tableData.schema) {
				try {
					await c.env.db.prepare(tableData.schema).run();
					successCount++;
				} catch (e) {
					console.error(`Failed to create table ${tableName}:`, e);
					errorCount++;
				}
			}
		}

		// 插入数据
		for (const [tableName, tableData] of Object.entries(d1Data.tables || {})) {
			if (tableData.data && tableData.data.length > 0) {
				const batch = [];
				for (const row of tableData.data) {
					const columns = Object.keys(row);
					const values = Object.values(row).map(val => {
						if (val === null) return 'NULL';
						if (typeof val === 'string') {
							return `'${val.replace(/'/g, "''")}'`;
						}
						return val;
					});
					const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values.join(', ')})`;
					batch.push(c.env.db.prepare(sql));
				}

				// 分批执行
				const batchSize = 100;
				for (let i = 0; i < batch.length; i += batchSize) {
					const batchSlice = batch.slice(i, i + batchSize);
					try {
						await c.env.db.batch(batchSlice);
						successCount += batchSlice.length;
					} catch (e) {
						console.error(`Failed to insert data into ${tableName}:`, e);
						errorCount += batchSlice.length;
					}
				}
			}
		}

		// 创建索引
		for (const idx of d1Data.indexes || []) {
			if (idx.sql) {
				try {
					await c.env.db.prepare(idx.sql).run();
					successCount++;
				} catch (e) {
					console.warn(`Failed to create index:`, e);
				}
			}
		}

		return { successCount, errorCount };
	},

	/**
	 * 导入 KV 数据
	 */
	async importKV(c, kvData) {
		let successCount = 0;
		let errorCount = 0;

		for (const [key, value] of Object.entries(kvData)) {
			try {
				// 根据键名确定是否需要 JSON 存储
				const isJsonKey = key.startsWith(KvConst.AUTH_INFO) || key === KvConst.SETTING;
				
				if (isJsonKey) {
					await c.env.kv.put(key, JSON.stringify(value), { 
						expirationTtl: key.startsWith(KvConst.AUTH_INFO) ? 60 * 60 * 24 * 30 : undefined 
					});
				} else {
					await c.env.kv.put(key, String(value));
				}
				successCount++;
			} catch (e) {
				console.error(`Failed to import KV key ${key}:`, e);
				errorCount++;
			}
		}

		return { successCount, errorCount };
	}
};

export default backupService;
