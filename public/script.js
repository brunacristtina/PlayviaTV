// Função para copiar a URL
function copyUrl() {
    const url = document.getElementById('addonUrl').textContent;
    navigator.clipboard.writeText(url).then(() => {
        showToast('✅ URL copiada!');
    }).catch(() => {
        const textArea = document.createElement('textarea');
        textArea.value = url;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showToast('✅ URL copiada!');
    });
}

// Função para instalar o addon (método padrão)
function installAddon() {
    // Pega a URL completa da página (ex: http://localhost:7000/manifest.json)
    const url = document.getElementById('addonUrl').textContent;
    // Remove o /manifest.json do final para obter a URL base
    const baseUrl = url.replace(/\/manifest\.json$/, '');
    // Constrói a URL de instalação do Stremio
    const installUrl = `stremio://${baseUrl.replace(/^https?:\/\//, '')}/manifest.json`;
    window.open(installUrl, '_blank');
    showToast('🚀 Abrindo Stremio...');
}

// Função alternativa para instalar
function installAddonAlternative() {
    // Pega a URL completa da página (ex: http://localhost:7000/manifest.json)
    const url = document.getElementById('addonUrl').textContent;
    // Remove o /manifest.json do final para obter a URL base
    const baseUrl = url.replace(/\/manifest\.json$/, '');
    // Constrói a URL de instalação alternativa
    const installUrl = `https://web.stremio.com/#/addons?addon=${encodeURIComponent(baseUrl + '/manifest.json')}`;
    window.open(installUrl, '_blank');
    showToast('📱 Abrindo página de instalação...');
}

// Função para mostrar toast
function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    updateUrl();
});