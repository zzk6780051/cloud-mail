import app from './hono/webs';
import { email } from './email/email';
import userService from './service/user-service';
import verifyRecordService from './service/verify-record-service';
import emailService from './service/email-service';
import r2Service from './service/r2-service';
import oauthService from './service/oauth-service';
import analysisService from './service/analysis-service';
export default {
	 async fetch(req, env, ctx) {

		const url = new URL(req.url)

		if (url.pathname.startsWith('/api/')) {
			url.pathname = url.pathname.replace('/api', '')
			req = new Request(url.toString(), req)
			return app.fetch(req, env, ctx);
		}

		 if (['/static/','/attachments/'].some(p => url.pathname.startsWith(p))) {
			 return await serveObject(env, url.pathname.substring(1));
		 }

		return env.assets.fetch(req);
	},
	email: email,
	async scheduled(c, env, ctx) {
		if (c.cron === '*/30 * * * *') {
			await analysisService.refreshEchartsCache({ env })
			return;
		}

		await verifyRecordService.clearRecord({ env })
		await userService.resetDaySendCount({ env })
		await emailService.completeReceiveAll({ env })
		await emailService.autoClean({ env })
		await analysisService.refreshEchartsCache({ env })
		await oauthService.clearNoBindOathUser({ env })
	},
};

//按当前存储类型(R2/S3/KV)读取对象,取不到时返回 404,避免 fetch 返回 null 触发 1101
async function serveObject(env, key) {

	let obj;

	try {
		obj = await r2Service.getObj({ env }, key);
	} catch (e) {
		//S3 后端对象不存在时会抛 NoSuchKey
		obj = null;
	}

	if (!obj) {
		return new Response('Not Found', {
			status: 404,
			headers: { 'Content-Type': 'text/plain; charset=utf-8' }
		});
	}

	if (obj instanceof Response) {
		return obj;
	}

	const headers = new Headers();

	if (typeof obj.writeHttpMetadata === 'function') {
		obj.writeHttpMetadata(headers);
		headers.set('etag', obj.httpEtag);
	}

	return new Response(obj.body, { headers });
}
