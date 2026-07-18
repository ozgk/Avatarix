// ==========================================
// AVATARIX UNIVERSAL SCRAPER v3.1
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
        .split(' on Spotify')[0].split(' / X')[0].split(' / Twitter')[0].split(' photos and videos')[0]
        .replace(/\s*Instagram.*$/, '').replace(/Spotify – .*/, '').trim();
};

// Helper: Limpa &amp; em URLs de og:image
const cleanImageUrl = (url) => {
    if (!url) return null;
    return url.replace(/&amp;/g, '&');
};

// Helper: Verifica se uma URL de imagem é logo genérica (e não foto de perfil real)
const isGenericLogo = (imgUrl, platform) => {
    if (!imgUrl) return true;
    const lower = imgUrl.toLowerCase();
    // Logos genéricas do Instagram
    if (platform === 'instagram' && (lower.includes('static.cdninstagram.com') || lower.includes('/rsrc.php/'))) return true;
    // Logos genéricas do Spotify
    if (platform === 'spotify' && (lower.includes('spotifycdn.com/cdn/images') || lower.includes('favicon'))) return true;
    return false;
};

// ==========================================
// LAYER 0: APIs DEDICADAS POR PLATAFORMA
// Cada plataforma tem sua rota otimizada
// ==========================================
const platformAPIs = {

    // ===== INSTAGRAM =====
    // Estratégia: Googlebot → Mobile API → Microlink
    instagram: async (url) => {
        const match = url.match(/instagram\.com\/([^/?#]+)/);
        if (!match) return null;
        const username = match[1].replace(/\/$/, '');
        if (['explore', 'reels', 'stories', 'p', 'reel', 'tv', 'accounts', 'directory', 'about', 'legal'].includes(username.toLowerCase())) return null;

        // Tentativa 1: Googlebot fetch (Instagram deixa o Google indexar)
        try {
            console.log(`[INSTAGRAM] Tentativa 1: Googlebot fetch para @${username}`);
            const res = await fetch(`https://www.instagram.com/${username}/`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
                    'Accept': 'text/html,application/xhtml+xml'
                },
                signal: AbortSignal.timeout(8000)
            });
            if (res.ok) {
                const html = await res.text();
                const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
                                html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
                const titleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);

                if (ogMatch?.[1]) {
                    const imgUrl = cleanImageUrl(ogMatch[1]);
                    // Valida: fotos de perfil reais vêm de scontent.cdninstagram.com
                    if (!isGenericLogo(imgUrl, 'instagram')) {
                        const name = cleanUsername(titleMatch?.[1], url) || username;
                        console.log(`[INSTAGRAM ✅] Googlebot retornou foto REAL de @${username}`);
                        return { avatar: imgUrl, username: name };
                    }
                    console.log(`[INSTAGRAM] Googlebot retornou logo genérica, tentando próxima camada...`);
                }
            }
        } catch (e) {
            console.log(`[INSTAGRAM] Googlebot falhou: ${e.message}`);
        }

        // Tentativa 2: Instagram Mobile API (pode funcionar em alguns servidores)
        try {
            console.log(`[INSTAGRAM] Tentativa 2: Mobile API para @${username}`);
            const res = await fetch(`https://i.instagram.com/api/v1/users/web_profile_info/?username=${username}`, {
                headers: {
                    'User-Agent': 'Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-S908B; b0q; qcom; en_US; 458229258)',
                    'X-IG-App-ID': '936619743392459'
                },
                signal: AbortSignal.timeout(5000)
            });
            if (res.ok) {
                const data = await res.json();
                const user = data?.data?.user;
                if (user) {
                    const avatar = user.profile_pic_url_hd || user.profile_pic_url;
                    const name = user.full_name || user.username || username;
                    if (avatar) {
                        console.log(`[INSTAGRAM ✅] Mobile API retornou foto de @${username}`);
                        return { avatar, username: name };
                    }
                }
            }
        } catch (e) {
            console.log(`[INSTAGRAM] Mobile API falhou: ${e.message}`);
        }

        // Tentativa 3: Microlink (tem seus próprios proxies)
        try {
            console.log(`[INSTAGRAM] Tentativa 3: Microlink para @${username}`);
            const res = await fetch(`https://api.microlink.io?url=${encodeURIComponent(`https://www.instagram.com/${username}/`)}`, {
                signal: AbortSignal.timeout(8000)
            });
            if (res.ok) {
                const data = await res.json();
                if (data.status === 'success' && data.data?.image?.url) {
                    const imgUrl = data.data.image.url;
                    if (!isGenericLogo(imgUrl, 'instagram')) {
                        const name = cleanUsername(data.data.title, url) || username;
                        console.log(`[INSTAGRAM ✅] Microlink retornou foto de @${username}`);
                        return { avatar: imgUrl, username: name };
                    }
                }
            }
        } catch (e) {
            console.log(`[INSTAGRAM] Microlink falhou: ${e.message}`);
        }

        return null;
    },

    // ===== SPOTIFY =====
    // Estratégia: Googlebot → Microlink
    spotify: async (url) => {
        const match = url.match(/spotify\.com\/(?:user|artist)\/([^/?#]+)/);
        if (!match) return null;
        const userId = match[1];

        // Tentativa 1: Googlebot fetch
        try {
            console.log(`[SPOTIFY] Tentativa 1: Googlebot fetch para ${userId}`);
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
                    'Accept': 'text/html,application/xhtml+xml'
                },
                signal: AbortSignal.timeout(8000)
            });
            if (res.ok) {
                const html = await res.text();
                const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
                                html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
                const titleMatch = html.match(/<title>([^<]+)<\/title>/i) ||
                                   html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);

                if (ogMatch?.[1]) {
                    const imgUrl = cleanImageUrl(ogMatch[1]);
                    if (!isGenericLogo(imgUrl, 'spotify')) {
                        const name = cleanUsername(titleMatch?.[1] || titleMatch?.[2], url) || userId;
                        console.log(`[SPOTIFY ✅] Googlebot retornou foto real`);
                        return { avatar: imgUrl, username: name };
                    }
                }
            }
        } catch (e) {
            console.log(`[SPOTIFY] Googlebot falhou: ${e.message}`);
        }

        // Tentativa 2: Microlink
        try {
            console.log(`[SPOTIFY] Tentativa 2: Microlink`);
            const res = await fetch(`https://api.microlink.io?url=${encodeURIComponent(url)}`, {
                signal: AbortSignal.timeout(8000)
            });
            if (res.ok) {
                const data = await res.json();
                if (data.status === 'success' && data.data) {
                    const imgUrl = data.data.image?.url || data.data.logo?.url;
                    if (imgUrl && !isGenericLogo(imgUrl, 'spotify')) {
                        const name = cleanUsername(data.data.title, url) || userId;
                        console.log(`[SPOTIFY ✅] Microlink retornou resultado`);
                        return { avatar: imgUrl, username: name };
                    }
                }
            }
        } catch (e) {
            console.log(`[SPOTIFY] Microlink falhou: ${e.message}`);
        }

        return null;
    },

    // ===== GITHUB =====
    // API pública gratuita, sem autenticação, 100% confiável
    github: async (url) => {
        const match = url.match(/github\.com\/([^/?#]+)/);
        if (!match) return null;
        const username = match[1];
        if (['features', 'pricing', 'about', 'login', 'signup', 'explore', 'topics', 'trending', 'settings', 'orgs', 'marketplace'].includes(username.toLowerCase())) return null;

        try {
            const res = await fetch(`https://api.github.com/users/${username}`, {
                headers: { 'User-Agent': 'Avatarix/3.1' },
                signal: AbortSignal.timeout(5000)
            });
            if (!res.ok) return null;
            const data = await res.json();
            console.log(`[GITHUB ✅] API retornou avatar de ${data.login}`);
            return { avatar: data.avatar_url, username: data.name || data.login };
        } catch (e) {
            console.log(`[GITHUB] API falhou: ${e.message}`);
            return null;
        }
    },

    // ===== TWITTER/X =====
    // Unavatar.io (serviço gratuito especializado em avatares)
    twitter: async (url) => {
        const match = url.match(/(?:twitter|x)\.com\/([^/?#]+)/);
        if (!match) return null;
        const username = match[1];
        if (['home', 'explore', 'search', 'settings', 'login', 'i', 'compose', 'messages', 'notifications'].includes(username.toLowerCase())) return null;

        try {
            const res = await fetch(`https://unavatar.io/x/${username}`, {
                redirect: 'manual',
                signal: AbortSignal.timeout(5000)
            });
            if (res.status === 200 && res.headers.get('content-type')?.startsWith('image')) {
                console.log(`[TWITTER ✅] Unavatar retornou avatar de @${username}`);
                return { avatar: `https://unavatar.io/x/${username}`, username };
            }
            if (res.status >= 300 && res.status < 400) {
                const location = res.headers.get('location');
                if (location) {
                    console.log(`[TWITTER ✅] Unavatar redirecionou para avatar de @${username}`);
                    return { avatar: location, username };
                }
            }
        } catch (e) {
            console.log(`[TWITTER] Unavatar falhou: ${e.message}`);
        }
        return null;
    },

    // ===== TIKTOK =====
    tiktok: async (url) => {
        const match = url.match(/tiktok\.com\/@?([^/?#]+)/);
        if (!match) return null;
        const username = match[1].replace('@', '');

        try {
            const res = await fetch(`https://unavatar.io/tiktok/${username}`, {
                redirect: 'manual',
                signal: AbortSignal.timeout(5000)
            });
            if (res.status === 200 && res.headers.get('content-type')?.startsWith('image')) {
                console.log(`[TIKTOK ✅] Unavatar retornou avatar de @${username}`);
                return { avatar: `https://unavatar.io/tiktok/${username}`, username };
            }
            if (res.status >= 300 && res.status < 400) {
                const location = res.headers.get('location');
                if (location) return { avatar: location, username };
            }
        } catch (e) {
            console.log(`[TIKTOK] Unavatar falhou: ${e.message}`);
        }
        return null;
    },

    // ===== YOUTUBE =====
    youtube: async (url) => {
        const match = url.match(/youtube\.com\/(?:@|channel\/|c\/|user\/)([^/?#]+)/);
        if (!match) return null;
        const identifier = match[1];

        try {
            const res = await fetch(`https://unavatar.io/youtube/${identifier}`, {
                redirect: 'manual',
                signal: AbortSignal.timeout(5000)
            });
            if (res.status === 200 && res.headers.get('content-type')?.startsWith('image')) {
                console.log(`[YOUTUBE ✅] Unavatar retornou avatar`);
                return { avatar: `https://unavatar.io/youtube/${identifier}`, username: identifier };
            }
            if (res.status >= 300 && res.status < 400) {
                const location = res.headers.get('location');
                if (location) return { avatar: location, username: identifier };
            }
        } catch (e) {
            console.log(`[YOUTUBE] Unavatar falhou: ${e.message}`);
        }
        return null;
    }
};

// Detecta qual plataforma a URL pertence
const detectPlatform = (url) => {
    try {
        const host = new URL(url).hostname.toLowerCase();
        if (host.includes('instagram.com')) return 'instagram';
        if (host.includes('spotify.com')) return 'spotify';
        if (host.includes('github.com')) return 'github';
        if (host.includes('twitter.com') || host.includes('x.com')) return 'twitter';
        if (host.includes('tiktok.com')) return 'tiktok';
        if (host.includes('youtube.com') || host.includes('youtu.be')) return 'youtube';
    } catch {}
    return null;
};

// ==========================================
// LAYER 1: GOOGLEBOT FETCH GENÉRICO
// Funciona para qualquer site que deixa o Google indexar
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

    const ogImgMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
                       html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
                       html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ||
                       html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);

    if (!ogImgMatch?.[1]) return null;

    const titleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
                       html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i) ||
                       html.match(/<title>([^<]+)<\/title>/i);

    return { avatar: cleanImageUrl(ogImgMatch[1]), username: cleanUsername(titleMatch?.[1], url) };
};

// ==========================================
// LAYER 2: FETCH NORMAL
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
    if (!ogImgMatch?.[1]) return null;

    const titleMatch = html.match(/<title>([^<]+)<\/title>/i) ||
                       html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);

    return { avatar: cleanImageUrl(ogImgMatch[1]), username: cleanUsername(titleMatch?.[1] || titleMatch?.[2], url) };
};

// ==========================================
// LAYER 3: MICROLINK API
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

    return { avatar, username: cleanUsername(data.data.title, url) };
};

// ==========================================
// ORQUESTRADOR PRINCIPAL
// ==========================================
const extractAvatar = async (url) => {
    console.log(`\n[AVATARIX v3.1] === Iniciando extração para: ${url} ===`);

    // LAYER 0: API Dedicada da plataforma
    const platform = detectPlatform(url);
    if (platform && platformAPIs[platform]) {
        try {
            console.log(`[LAYER 0] Plataforma detectada: ${platform.toUpperCase()}`);
            const result = await platformAPIs[platform](url);
            if (result?.avatar) return result;
            console.log(`[LAYER 0] Handler dedicado não retornou resultado, caindo para layers genéricos...`);
        } catch (e) {
            console.log(`[LAYER 0 ERRO] ${e.message}`);
        }
    }

    // LAYER 1: Googlebot Fetch genérico
    try {
        console.log(`[LAYER 1] Googlebot fetch genérico...`);
        const result = await googlebotFetch(url);
        if (result?.avatar) {
            console.log(`[LAYER 1 ✅] Googlebot retornou avatar`);
            return result;
        }
    } catch (e) {
        console.log(`[LAYER 1 FALHOU] ${e.message}`);
    }

    // LAYER 2: Fetch Normal
    try {
        console.log(`[LAYER 2] Fetch normal...`);
        const result = await normalFetch(url);
        if (result?.avatar) {
            console.log(`[LAYER 2 ✅] Fetch normal retornou avatar`);
            return result;
        }
    } catch (e) {
        console.log(`[LAYER 2 FALHOU] ${e.message}`);
    }

    // LAYER 3: Microlink
    try {
        console.log(`[LAYER 3] Microlink API...`);
        const result = await microlinkFetch(url);
        if (result?.avatar) {
            console.log(`[LAYER 3 ✅] Microlink retornou avatar`);
            return result;
        }
    } catch (e) {
        console.log(`[LAYER 3 FALHOU] ${e.message}`);
    }

    console.log(`[AVATARIX v3.1] ❌ Todas as camadas falharam para: ${url}`);
    return null;
};

export { extractAvatar };
