import r2Service from '../service/r2-service';
import app from '../hono/hono';

app.get('/oss/*', async (c) => {
	const key = c.req.path.replace(/^\/oss\//, '');
	if (!key) {
		return c.body('Not Found', 404);
	}
	return await r2Service.toObjResp(c, key);
});


