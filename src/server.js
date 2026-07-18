import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { connectCache, getCache, setCache } from './services/cache.js';
import { extractAvatar } from './services/scraper.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração Express (Segurança e Middlewares)
// Habilita CORS para permitir conexões externas se a API for publica
app.use(cors());

// Habilita Helmet configurado para permitir imagens de outros domínios
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      },
    },
  })
);

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Controle Concorrência / Rate Limiter: max 50 requisições por 15 minutos
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    message: { error: 'Muitas requisições da sua máquina, tente novamente mais tarde.' }
});

app.use('/api/', limiter);

// Conectar ao Redis em background
connectCache().catch(console.error);

// Endpoint Principal (Cascata de Extração)
app.post('/api/extract', async (req, res) => {
    let { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'Entrada ausente.' });
    }
    
    url = url.trim();
    const isDiscordId = /^\d{17,19}$/.test(url);

    try {
        // Passo 1: Cache Check
        const cacheKey = `avatar:${url}`;
        const cachedResult = await getCache(cacheKey);

        if (cachedResult) {
            console.log(`[CACHE HIT] ${url}`);
            try {
                const parsed = JSON.parse(cachedResult);
                return res.json({ url, source: 'cache', ...parsed });
            } catch (e) {
                return res.json({ url, avatar: cachedResult, source: 'cache' });
            }
        }

        let profile = { avatar: null, banner: null, decoration: null, color: null, username: null };

        if (isDiscordId) {
            console.log(`[DISCORD EXTRACTION INICIADA] ${url}`);
            const token = process.env.DISCORD_BOT_TOKEN;
            
            if (token) {
                try {
                    const discordRes = await fetch(`https://discord.com/api/v10/users/${url}`, {
                        headers: { 'Authorization': `Bot ${token}` }
                    });

                    if (discordRes.ok) {
                        const discordUser = await discordRes.json();
                        profile.username = discordUser.global_name || discordUser.username;
                        profile.color = discordUser.banner_color || null;
                        
                        if (discordUser.avatar) {
                            const format = discordUser.avatar.startsWith('a_') ? 'gif' : 'png';
                            profile.avatar = `https://cdn.discordapp.com/avatars/${url}/${discordUser.avatar}.${format}?size=512`;
                        } else {
                            const defaultAvatarIndex = Number((BigInt(url) >> 22n) % 6n);
                            profile.avatar = `https://cdn.discordapp.com/embed/avatars/${defaultAvatarIndex}.png`;
                        }

                        if (discordUser.banner) {
                            const format = discordUser.banner.startsWith('a_') ? 'gif' : 'png';
                            profile.banner = `https://cdn.discordapp.com/banners/${url}/${discordUser.banner}.${format}?size=512`;
                        }
                    }
                } catch (e) {
                    console.error('Erro na API oficial do Discord', e);
                }
            }
            
            // Fallback sem token (usando API pública JAPI.REST)
            if (!profile.avatar) {
                console.log(`[FALLBACK JAPI.REST DISCORD ID SEM TOKEN] ${url}`);
                try {
                    const japiRes = await fetch(`https://japi.rest/discord/v1/user/${url}`);
                    if (japiRes.ok) {
                        const japiData = await japiRes.json();
                        if (japiData?.data) {
                            const d = japiData.data;
                            profile.username = d.global_name || d.username;
                            profile.color = d.banner_color || null;
                            
                            if (d.avatarURL) {
                                profile.avatar = d.avatarURL;
                                if (!profile.avatar.includes('?size=')) profile.avatar += '?size=512';
                            } else if (d.defaultAvatarURL) {
                                profile.avatar = d.defaultAvatarURL;
                            }
                            
                            if (d.bannerURL) {
                                profile.banner = d.bannerURL;
                                if (!profile.banner.includes('?size=')) profile.banner += '?size=512';
                            }
                            
                            if (d.avatar_decoration_data?.asset) {
                                profile.decoration = `https://cdn.discordapp.com/avatar-decoration-presets/${d.avatar_decoration_data.asset}.png?size=512`;
                            }
                        }
                    }
                } catch (e) {
                    console.error('Erro no fallback JAPI.REST:', e);
                }
                
                // Fallback final scraping se JAPI falhar
                if (!profile.avatar) {
                    console.log(`[FALLBACK SCRAPING DISCORD ID SEM TOKEN] ${url}`);
                    const scrapeResult = await extractAvatar(`https://discord.com/users/${url}`);
                    if (scrapeResult && scrapeResult.avatar) {
                        profile.avatar = scrapeResult.avatar;
                    }
                }
            }
        } else if (!url.startsWith('http')) {
            return res.status(400).json({ error: 'URL ou ID inválido. Insira uma URL (http/https) ou um ID numérico.' });
        } else {
            console.log(`[SCRAPING INICIADO] ${url}`);
            const scrapeResult = await extractAvatar(url);
            if (scrapeResult && scrapeResult.avatar) {
                profile.avatar = scrapeResult.avatar;
                profile.username = scrapeResult.username;
            }
        }

        // Graceful Fallback em caso de falha de extração ou bloqueios (CAPTCHA etc)
        if (!profile.avatar) {
            return res.status(404).json({ 
                error: 'Não foi possível extrair a foto de perfil da página. Pode haver um bloqueio CAPTCHA ativo ou o perfil não possui foto acessível publicamente.' 
            });
        }

        // Passo 6: Save & Return
        await setCache(cacheKey, JSON.stringify(profile), 86400); // 24h em segundos

        return res.json({ url, ...profile, source: isDiscordId ? 'discord_api' : 'live_scraping' });

    } catch (error) {
        console.error('API Error interno:', error);
        return res.status(500).json({ error: 'Erro interno no servidor de extração. Graceful fallback executado.' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Avatar API Pro rodando em http://localhost:${PORT}`);
});
