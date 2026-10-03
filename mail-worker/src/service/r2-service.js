import s3Service from './s3-service';
import settingService from './setting-service';
import kvObjService from './kv-obj-service';

const r2Service = {

	async storageType(c) {

		const setting = await settingService.query(c);
		const { bucket, endpoint, s3AccessKey, s3SecretKey } = setting;

		if (!!(bucket && endpoint && s3AccessKey && s3SecretKey)) {
			return 'S3';
		}

		if (c.env.r2) {
			return 'R2';
		}

		return 'KV';
	},

	async putObj(c, key, content, metadata) {

		const storageType = await this.storageType(c);

		if (storageType === 'KV') {
			await kvObjService.putObj(c, key, content, metadata);
		}

		if (storageType === 'R2') {
			await c.env.r2.put(key, content, {
				httpMetadata: { ...metadata }
			});
		}

		if (storageType === 'S3') {
			await s3Service.putObj(c, key, content, metadata);
		}

	},

	async getObj(c, key) {
		const storageType = await this.storageType(c);

		if (storageType === 'KV') {
			return await kvObjService.getObj(c, key);
		}

		if (storageType === 'R2') {
			return await c.env.r2.get(key);
		}

		if (storageType === 'S3') {
			return await s3Service.getObj(c, key);
		}
	},

	async delete(c, key) {

		const storageType = await this.storageType(c);

		if (storageType === 'KV') {
			await kvObjService.deleteObj(c, key);
		}

		if (storageType === 'R2') {
			await c.env.r2.delete(key);
		}

		if (storageType === 'S3'){
			await s3Service.deleteObj(c, key);
		}

	},

	//把对象读成合法的 Response。对象不存在时返回 404，而不是 null
	//（fetch 返回 null 会让 Cloudflare 抛 error 1101）
	async toObjResp(c, key) {

		let obj;

		try {
			obj = await this.getObj(c, key);
		} catch (e) {
			//S3 后端读不存在的对象时会抛 NoSuchKey
			obj = null;
		}

		if (!obj) {
			return new Response('Not Found', {
				status: 404,
				headers: { 'Content-Type': 'text/plain; charset=utf-8' }
			});
		}

		//KV/S3 后端返回的已经是 Response
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

};
export default r2Service;
