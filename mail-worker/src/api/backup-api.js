import app from '../hono/hono';
import backupService from '../service/backup-service';
import result from '../model/result';
import userContext from '../security/user-context';

app.get('/backup/export', async (c) => {
	const user = userContext.getUser(c);
	
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

app.post('/backup/import', async (c) => {
	const user = userContext.getUser(c);
	
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