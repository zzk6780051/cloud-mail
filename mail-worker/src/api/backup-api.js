import app from '../hono/hono';
import backupService from '../service/backup-service';
import result from '../model/result';
import userContext from '../security/user-context';

/**
 * 导出数据库（D1 + KV）
 * GET /backup/export
 */
app.get('/backup/export', async (c) => {
	const user = userContext.getUser(c);
	
	// 只有管理员可以导出数据库
	if (c.env.admin !== user.email) {
		return c.json(result.fail(c.t('unauthorized'), 403), 403);
	}

	const jsonContent = await backupService.exportDatabase(c);
	
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
	const filename = `cloud-mail-backup-${timestamp}.json`;

	return new Response(jsonContent, {
		headers: {
			'Content-Type': 'application/json',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
});

/**
 * 导入数据库（D1 + KV）
 * POST /backup/import
 */
app.post('/backup/import', async (c) => {
	const user = userContext.getUser(c);
	
	// 只有管理员可以导入数据库
	if (c.env.admin !== user.email) {
		return c.json(result.fail(c.t('unauthorized'), 403), 403);
	}

	const formData = await c.req.formData();
	const file = formData.get('file');

	if (!file) {
		return c.json(result.fail(c.t('backupNoFile')));
	}

	const jsonContent = await file.text();
	const importResult = await backupService.importDatabase(c, jsonContent);

	return c.json(result.ok(importResult));
});
