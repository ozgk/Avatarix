// ==========================================
// AVATARIX UNIVERSAL SCRAPER v3.0
// Motor de extração universal sem Puppeteer
// Funciona em qualquer servidor (Render, Railway, Vercel, etc.)
// ==========================================

// Helper: Limpa o nome de usuário de títulos de páginas
const cleanUsername = (raw, url) => {
    if (!raw) return new URL(url).hostname;
    return raw
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&#064;/g, '@').replace(/&#x2022;/g, '•').replace(/&quot;/g, '"')
        .split(' •')[0].split(' |')[0].split(' -')[0].split(' (@')[0]
        .split(' on Instagram')[0].split(' on X')[0].split(' on GitHub')[0]
        .split(' / X')[0].split(' / Twitter')[0]
        .trim();
};

// Helper: Limpa &amp; em URLs de og:image (Instagram faz isso)
const cleanImageUrl = (url) => {
    if (!url) return null;
    return url.replace(/&amp;/g, '&');
};

// ==========================================
// LAYER 0: APIs DEDICADAS POR PLATAFORMA
// Cada plataforma tem sua rota otimizada
// ==========================================
const platformAPIs = {
    // GitHub: API pública gratuita, sem autenticação
    github: async (url) => {
        const match = url.match(/github\.com\/([^/?#]+)/);
        if (!match) return null;
        const username = match[1];
        // Ignora páginas que não são perfis
        if (['features', 'pricing', 'about', 'login', 'signup', 'explore', 'topics', 'trending', 'settings'].includes(username.toLowerCase())) return null;

        const res = await fetch(`https://api.github.com/users/${username}`, {
            headers: { 'User-Agent': 'Avatarix/3.0' },
            signal: AbortSignal.timeout(5000)
        });
        if (!res.ok) return null;
        const data = await res.json();
        return { avatar: data.avatar_url, username: data.name || data.login };
    },

    // Twitter/X: Unavatar.io (serviço gratuito especializado)
    twitter: async (url) => {
        const match = url.match(/(?:twitter|x)\.com\/([^/?#]+)/);
        if (!match) return null;
        const username = match[1];
        if (['home', 'explore', 'search', 'settings', 'login', 'i'].includes(username.toLowerCase())) return null;

        const res = await fetch(`https://unavatar.io/x/${username}`, { 
            redirect: 'manual',
            signal: AbortSignal.timeout(5000)
        });
        // Unavatar retorna a imagem diretamente (200) ou redireciona para ela
        if (res.status === 200 && res.headers.get('content-type')?.startsWith('image')) {
            return { avatar: `https://unavatar.io/x/${username}`, username };
        }
        if (res.status >= 300 && res.status < 400) {
            const location = res.headers.get('location');
            if (location) return { avatar: location, username };
        }
        return null;
    },

    // TikTok: Unavatar.io
    tiktok: async (url) => {
        const match = url.match(/tiktok\.com\/@?([^/?#]+)/);
        if (!match) return null;
        const username = match[1].replace('@', '');

        const res = await fetch(`https://unavatar.io/tiktok/${username}`, { 
            redirect: 'manual',
            signal: AbortSignal.timeout(5000)
        });
        if (res.status === 200 && res.headers.get('content-type')?.startsWith('image')) {
            return { avatar: `https://unavatar.io/tiktok/${username}`, username };
        }
        if (res.status >= 300 && res.status < 400) {
            const location = res.headers.get('location');
            if (location) return { avatar: location, username };
        }
        return null;
    },

    // YouTube: Unavatar.io
    youtube: async (url) => {
        const match = url.match(/youtube\.com\/(?:@|channel\/|c\/|user\/)([^/?#]+)/) ||
                      url.match(/youtu\.be\/([^/?#]+)/);
        if (!match) return null;
        const identifier = match[1];

        const res = await fetch(`https://unavatar.io/youtube/${identifier}`, { 
            redirect: 'manual',
            signal: AbortSignal.timeout(5000)
        });
        if (res.status === 200 && res.headers.get('content-type')?.startsWith('image')) {
            return { avatar: `https://unavatar.io/youtube/${identifier}`, username: identifier };
        }
        if (res.status >= 300 && res.status < 400) {
            const location = res.headers.get('location');
            if (location) return { avatar: location, username: identifier };
        }
        return null;
    }
};

// Detecta qual plataforma a URL pertence
const detectPlatform = (url) => {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('github.com')) return 'github';
    if (host.includes('twitter.com') || host.includes('x.com')) return 'twitter';
    if (host.includes('tiktok.com')) return 'tiktok';
    if (host.includes('youtube.com') || host.includes('youtu.be')) return 'youtube';
    return null;
};

// ==========================================
// LAYER 1: GOOGLEBOT FETCH (Arma Secreta)
// O Google tem permissão especial em TODOS os sites
// Fingimos ser o Googlebot para ter acesso às meta tags
// ==========================================
const googlebotFetch = async (url) => {
    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
            'Accept': 'text/html,application/xhtml+xml'
        },
        signal: AbortSignal.timeout(8000)
    });

    if (!res.ok) return null;
    const html = await res.text();

    // Extrai og:image (funciona para Instagram, Spotify, LinkedIn, etc.)
    const ogImgMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
                       html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
                       html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ||
                       html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);

    if (!ogImgMatch || !ogImgMatch[1]) return null;

    // Extrai título/nome de usuário
    const titleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
                       html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i) ||
                       html.match(/<title>([^<]+)<\/title>/i);

    const username = cleanUsername(titleMatch?.[1], url);
    const avatar = cleanImageUrl(ogImgMatch[1]);

    // Filtra logos genéricas (como a logo do Instagram em vez da foto do perfil)
    // Se a imagem for muito pequena em tamanho de arquivo, pode ser uma logo
    // Mas preferimos retornar algo a não retornar nada
    return { avatar, username };
};

// ==========================================
// LAYER 2: FETCH NORMAL (User-Agent de navegador)
// Para sites que não bloqueiam mas não servem Googlebot
// ==========================================
const normalFetch = async (url) => {
    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml'
        },
        signal: AbortSignal.timeout(5000)
    });

    if (!res.ok) return null;
    const html = await res.text();

    const ogImgMatch = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']/i) ||
                       html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i);

    if (!ogImgMatch || !ogImgMatch[1]) return null;

    const titleMatch = html.match(/<title>([^<]+)<\/title>/i) ||
                       html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);

    return { avatar: cleanImageUrl(ogImgMatch[1]), username: cleanUsername(titleMatch?.[1] || titleMatch?.[2], url) };
};

// ==========================================
// LAYER 3: MICROLINK API (Última Esperança)
// API de terceiros gratuita que tem seus próprios proxies
// ==========================================
const microlinkFetch = async (url) => {
    const res = await fetch(`https://api.microlink.io?url=${encodeURIComponent(url)}`, {
        signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 'success' || !data.data) return null;

    const avatar = data.data.image?.url || data.data.logo?.url;
    if (!avatar) return null;

    let username = data.data.title || new URL(url).hostname;
    username = cleanUsername(username, url);
    return { avatar, username };
};

// ==========================================
// ORQUESTRADOR PRINCIPAL
// Cascata inteligente: API dedicada → Googlebot → Normal → Microlink
// ==========================================
const extractAvatar = async (url) => {
    console.log(`[AVATARIX v3.0] Iniciando extração universal para: ${url}`);

    // LAYER 0: API Dedicada da plataforma (ultra-rápido, zero memória)
    const platform = detectPlatform(url);
    if (platform && platformAPIs[platform]) {
        try {
            console.log(`[LAYER 0] Tentando API dedicada: ${platform}`);
            const result = await platformAPIs[platform](url);
            if (result?.avatar) {
                console.log(`[LAYER 0 SUCESSO ✅] ${platform} API retornou avatar`);
                return result;
            }
        } catch (e) {
            console.log(`[LAYER 0 FALHOU] ${platform}: ${e.message}`);
        }
    }

    // LAYER 1: Googlebot Fetch (funciona para Instagram, Spotify, LinkedIn, etc.)
    try {
        console.log(`[LAYER 1] Tentando Googlebot fetch...`);
        const result = await googlebotFetch(url);
        if (result?.avatar) {
            console.log(`[LAYER 1 SUCESSO ✅] Googlebot retornou avatar`);
            return result;
        }
    } catch (e) {
        console.log(`[LAYER 1 FALHOU] Googlebot: ${e.message}`);
    }

    // LAYER 2: Fetch Normal (para sites amigáveis)
    try {
        console.log(`[LAYER 2] Tentando fetch normal...`);
        const result = await normalFetch(url);
        if (result?.avatar) {
            console.log(`[LAYER 2 SUCESSO ✅] Fetch normal retornou avatar`);
            return result;
        }
    } catch (e) {
        console.log(`[LAYER 2 FALHOU] Fetch normal: ${e.message}`);
    }

    // LAYER 3: Microlink (último recurso com proxies de terceiros)
    try {
        console.log(`[LAYER 3] Tentando Microlink API...`);
        const result = await microlinkFetch(url);
        if (result?.avatar) {
            console.log(`[LAYER 3 SUCESSO ✅] Microlink retornou avatar`);
            return result;
        }
    } catch (e) {
        console.log(`[LAYER 3 FALHOU] Microlink: ${e.message}`);
    }

    console.log(`[AVATARIX v3.0] ❌ Todas as camadas falharam para: ${url}`);
    return null;
};

export { extractAvatar };
