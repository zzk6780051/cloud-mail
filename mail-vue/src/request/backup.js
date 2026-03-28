import http from '@/axios/index.js';

export function backupExport() {
	return fetch(import.meta.env.VITE_BASE_URL + '/backup/export', {
		method: 'GET',
		headers: {
			'Authorization': localStorage.getItem('token'),
			'accept-language': localStorage.getItem('lang') || 'zh'
		}
	}).then(response => {
		if (!response.ok) {
			return response.json().then(data => {
				throw data;
			});
		}
		return response.blob();
	});
}

export function backupImport(file) {
	const formData = new FormData();
	formData.append('file', file);
	
	return fetch(import.meta.env.VITE_BASE_URL + '/backup/import', {
		method: 'POST',
		headers: {
			'Authorization': localStorage.getItem('token'),
			'accept-language': localStorage.getItem('lang') || 'zh'
		},
		body: formData
	}).then(response => {
		return response.json();
	}).then(data => {
		if (data.code !== 200) {
			throw data;
		}
		return data.data;
	});
}