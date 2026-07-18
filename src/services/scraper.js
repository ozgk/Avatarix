import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Habilita o plugin stealth para evitar detecção de Cloudflare/Datadome
puppeteer.use(StealthPlugin());

const extractAvatar = async (url) => {
    // LAYER 0: Ultra-Fast Static Fetch (Economiza 100% de memória se o site for simples como GitHub)
    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html'
            },
            signal: AbortSignal.timeout(5000)
        });
        
        if (res.ok) {
            const html = await res.text();
            
            // Regex simples para pegar imagens Open Graph
            const ogImgMatch = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']/i) || 
                               html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i);
            
            if (ogImgMatch && ogImgMatch[1]) {
                const titleMatch = html.match(/<title>([^<]+)<\/title>/i) || 
                                   html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
                
                let username = titleMatch && titleMatch[1] ? titleMatch[1] : new URL(url).hostname;
                username = username.split(' •')[0].split(' |')[0].split(' -')[0].split(' (@')[0].trim();
                
                console.log(`[LAYER 0 SUCESSO] Extração rápida (sem Puppeteer) para ${url}`);
                return { avatar: ogImgMatch[1], username };
            }
        }
    } catch (e) {
        console.log(`Layer 0 falhou, tentando Puppeteer...`);
    }

    let browser = null;
    try {
        browser = await puppeteer.launch({
            headless: true,
            // Argumentos otimizados para estabilidade no Docker
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu'
            ],
            // Usar o Chromium do sistema se estiver no Docker, senão usa o padrão
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null
        });

        const page = await browser.newPage();
        
        // Simular um dispositivo móvel (iPhone 14) aumenta a taxa de sucesso 
        // e diminui pop-ups de login em redes sociais
        await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1');
        await page.setViewport({ width: 390, height: 844, isMobile: true });

        // Navegação com waitUntil domcontentloaded para rapidez
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        
        // Verifica se houve um bloqueio severo, ignoramos 403 pq pode ser cloudflare que pode ser contornado na leitura
        if (response && response.status() >= 400 && response.status() !== 403) {
            console.log(`Página retornou status ${response.status()} para ${url}`);
        }

        // Title Extraction Helper
        const getTitle = await page.evaluate(() => {
            const ogTitle = document.querySelector('meta[property="og:title"]');
            if (ogTitle && ogTitle.content) return ogTitle.content.split(' •')[0].split(' (@')[0].trim();
            return document.title.split(' |')[0].split(' -')[0].trim();
        });

        // Layer 1: Regras Dedicadas baseadas no Hostname (Alta qualidade)
        const hostname = new URL(url).hostname;
        let dedicatedSelector = null;

        if (hostname.includes('github.com')) {
            dedicatedSelector = 'img.avatar-user, img.avatar';
        } else if (hostname.includes('instagram.com')) {
            dedicatedSelector = 'header img';
        } else if (hostname.includes('linkedin.com')) {
            dedicatedSelector = 'img.pv-top-card-profile-picture__image';
        }

        if (dedicatedSelector) {
            try {
                await page.waitForSelector(dedicatedSelector, { timeout: 3000 });
                const specificImage = await page.evaluate((sel) => {
                    const img = document.querySelector(sel);
                    return img ? img.src : null;
                }, dedicatedSelector);
                
                if (specificImage) return { avatar: specificImage, username: getTitle };
            } catch (err) {
                console.log(`Layer 1 (Regra Dedicada) falhou para ${dedicatedSelector}`);
            }
        }

        // Layer 2: Open Graph / Twitter Meta Tags (Fallback Confiável)
        const ogImage = await page.evaluate(() => {
            const og = document.querySelector('meta[property="og:image"]');
            if (og && og.content) return og.content;
            const twitter = document.querySelector('meta[name="twitter:image"]');
            if (twitter && twitter.content) return twitter.content;
            return null;
        });

        if (ogImage) {
            return { avatar: ogImage, username: getTitle };
        }

        // Layer 3: Heurística de DOM (Varredura inteligente)
        const heuristicImage = await page.evaluate(() => {
            const images = Array.from(document.querySelectorAll('img'));
            
            for (const img of images) {
                const rect = img.getBoundingClientRect();
                // Ignorar imagens muitos pequenas (ícones de UI)
                if ((rect.width > 0 && rect.width < 50) || (rect.height > 0 && rect.height < 50)) {
                    continue; 
                }

                const searchTarget = `${img.className} ${img.id} ${img.alt} ${img.src}`.toLowerCase();
                
                if (
                    searchTarget.includes('avatar') ||
                    searchTarget.includes('profile') ||
                    searchTarget.includes('user') ||
                    searchTarget.includes('pic')
                ) {
                    if (img.src && img.src.startsWith('http')) {
                         return img.src;
                    }
                }
            }
            return null;
        });

        if (heuristicImage) {
            return { avatar: heuristicImage, username: getTitle };
        }

        // Nenhuma camada obteve sucesso
        return null;

    } catch (error) {
        console.error(`Erro ao fazer scraping em ${url}:`, error.message);
        return null; // Graceful Fallback
    } finally {
        // PREVENÇÃO CRÍTICA DE MEMORY LEAK
        if (browser) {
            await browser.close().catch(e => console.error('Erro ao fechar o browser:', e));
        }
    }
};

export { extractAvatar };
