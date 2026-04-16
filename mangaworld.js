
async function searchResults(keyword) {
    try {

        const url = `https://www.mangaworld.mx/archive?keyword=${encodeURIComponent(keyword)}`;
        const response = await soraFetch(url);
        
        if (!response) {
            console.log("Errore: Nessuna risposta dal server.");
            return JSON.stringify([]);
        }

        const html = await response.text();
        

        console.log("HTML ricevuto, lunghezza: " + html.length);

        const results = [];
        
        
        const regex = /<div class="entry">[\s\S]*?<a[^>]+href="([^"]+)"[^>]+title="([^"]+)"[\s\S]*?<img[^>]+src="([^"]+)"/g;

        let match;
        while ((match = regex.exec(html)) !== null) {
            results.push({
                title: match[2].trim(),
                href: match[1].trim(),

                image: match[3].startsWith('http') ? match[3].trim() : 'https:' + match[3].trim()
            });
        }

        console.log("Risultati trovati: " + results.length);
        return JSON.stringify(results);
    } catch (error) {
        console.log('Errore nella ricerca: ' + error);
        return JSON.stringify([]);
    }
}

async function extractDetails(url) {
    try {
        const response = await soraFetch(url);
        const html = await response.text();


        const descMatch = html.match(/<div class="summary">[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/);
        const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : 'Nessuna descrizione';


        const authorMatch = html.match(/Autore:<\/span>[\s\S]*?">([^<]+)<\/a>/);
        const statusMatch = html.match(/Stato:<\/span>[\s\S]*?">([^<]+)<\/a>/);
        
        const aliases = `
Autore: ${authorMatch ? authorMatch[1] : 'Sconosciuto'}
Stato: ${statusMatch ? statusMatch[1] : 'Sconosciuto'}
Lingua: Italiano
        `.trim();

        return JSON.stringify([{
            description: description,
            aliases: aliases,
            airdate: ''
        }]);
    } catch (error) {
        return JSON.stringify([{ description: 'Errore caricamento', aliases: '', airdate: '' }]);
    }
}

async function extractChapters(url) {
    try {
        const response = await soraFetch(url);
        const html = await response.text();

        const chapters = [];
      
        const chapterRegex = /<a[^>]*class="chapter-link"[^>]*href="([^"]+)"[^>]*>[\s\S]*?<span class="chapter-name">([^<]+)<\/span>/g;
        
        let match;
        let count = 1;
        while ((match = chapterRegex.exec(html)) !== null) {
            chapters.push({
                href: match[1].trim(),
                title: match[2].trim(),
                number: count++
            });
        }


        return JSON.stringify(chapters.reverse());
    } catch (error) {
        return JSON.stringify([]);
    }
}


async function extractText(url) {
    try {
        const response = await soraFetch(url);
        const html = await response.text();

       
        const contentMatch = html.match(/<div class="read-container">([\s\S]*?)<\/div>/);
        if (!contentMatch) throw new Error("Contenuto non trovato");

        let content = contentMatch[1];

    
        const pTags = content.match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
        if (!pTags) return "Testo non disponibile (potrebbe essere una serie di immagini).";

        const cleanedText = pTags
            .map(p => p.replace(/<[^>]+>/g, '').trim())
            .filter(text => text.length > 0)
            .join('\n\n');

        return cleanedText;
    } catch (error) {
        return "Errore durante l'estrazione del testo.";
    }
}


async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    try {
        return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET', options.body ?? null);
    } catch(e) {
        try {
            return await fetch(url, options);
        } catch(error) {
            return null;
        }
    }
}
