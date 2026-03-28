import {useSettingStore} from "@/store/setting.js";
export function cvtR2Url(key) {

    if (!key) {
        return + 'https://' + ''
    }

    if (key.startsWith('https://')) {
        return key
    }

    const { settings } = useSettingStore();

    // 优先使用 S3 配置（endpoint + bucket）
    if (settings.endpoint && settings.bucket) {
        let endpoint = settings.endpoint;
        if (!endpoint.startsWith('http')) {
            endpoint = 'https://' + endpoint;
        }
        if (endpoint.endsWith("/")) {
            endpoint = endpoint.slice(0, -1);
        }
        return endpoint + '/' + settings.bucket + '/' + key;
    }

    // 其次使用 r2Domain
    let domain = settings.r2Domain

    if (!domain) {
        return key;
    }

    if (!domain.startsWith('http')) {
        return 'https://' + domain + '/' + key
    }

    if (domain.endsWith("/")) {
        domain = domain.slice(0, -1);
    }
    return domain + '/' + key
}

export function toOssDomain(domain) {

    if (!domain) {
        return ''
    }

    if (!domain.startsWith('http')) {
        return 'https://' + domain
    }

    if (domain.endsWith("/")) {
        domain = domain.slice(0, -1);
    }

    return domain
}
