// ─── Scraper Cardmarket via WebView caché ─────────────────────────
// Le WebView est un vrai navigateur → bypass Cloudflare.
// Rendu invisible (1x1px, opacity 0) — extrait le prix via JS injecté.
import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebView as WebViewType } from 'react-native-webview';

interface ScraperResult {
  price: number | null;
  productUrl: string | null;
}

interface Props {
  url: string;
  onResult: (result: ScraperResult) => void;
}

// JS injecté après chargement de la page — extrait le prix NM minimum
const PRICE_JS = `
(function() {
  var prices = [];

  // Méthode 1 : données structurées JSON-LD
  [].slice.call(document.querySelectorAll('script[type="application/ld+json"]')).forEach(function(s) {
    try {
      var d = JSON.parse(s.textContent);
      if (d && d.offers) {
        var offer = Array.isArray(d.offers) ? d.offers[0] : d.offers;
        if (offer && offer.price) prices.push(parseFloat(offer.price));
      }
    } catch(e) {}
  });

  // Méthode 2 : spans prix (color-primary)
  [].slice.call(document.querySelectorAll('.color-primary')).forEach(function(el) {
    var text = el.textContent.trim();
    var m = text.match(/(\\d+)[,\\.](\\d{2})\\s*€/) || text.match(/(\\d+)\\s*,\\s*(\\d{2})\\s*€/);
    if (m) prices.push(parseFloat(m[1] + '.' + m[2]));
  });

  // Méthode 3 : toutes les valeurs €
  if (!prices.length) {
    var allText = document.body.innerText;
    var re = /(\\d+)[,\\.](\\d{2})\\s*€/g;
    var match;
    while ((match = re.exec(allText)) !== null) {
      var p = parseFloat(match[1] + '.' + match[2]);
      if (p > 0 && p < 5000) prices.push(p);
    }
  }

  var valid = prices.filter(function(p) { return p > 0 && p < 5000; });
  valid.sort(function(a, b) { return a - b; });

  window.ReactNativeWebView.postMessage(JSON.stringify({
    success: valid.length > 0,
    price: valid.length > 0 ? valid[0] : null,
    url: window.location.href
  }));
})();
true;
`;

export function CardmarketScraper({ url, onResult }: Props) {
  const webviewRef = useRef<WebViewType>(null);

  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        ref={webviewRef}
        source={{ uri: url }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        // User-Agent mobile réaliste pour passer Cloudflare
        userAgent="Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36"
        onLoadEnd={() => {
          // Injecter le JS d'extraction après le chargement complet de la page
          setTimeout(() => {
            webviewRef.current?.injectJavaScript(PRICE_JS);
          }, 1500);
        }}
        onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data) as {
              success: boolean;
              price: number | null;
              url: string;
            };
            onResult({
              price: data.success ? data.price : null,
              productUrl: data.url ?? null,
            });
          } catch {
            onResult({ price: null, productUrl: null });
          }
        }}
        onError={() => onResult({ price: null, productUrl: null })}
        // Bloquer les médias pour accélérer le chargement
        mediaPlaybackRequiresUserAction
        allowsInlineMediaPlayback={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    overflow: 'hidden',
    top: -9999,
    left: -9999,
  },
  webview: {
    width: 375,
    height: 812,
  },
});
