const API = 'https://script.google.com/macros/s/AKfycbyHZOzKFBDQTqb-Tp4q1rZtZE7LrzrNi1bqueb1GwfLgYBoUvyPBCfiYKNXFyuDQt1b/exec';

let ultimoOdometro = 0;
let selectedImages = [];
let isProcessing = false;
let isSyncing = false; 

document.addEventListener('DOMContentLoaded', () => {
  
  carregarDados();
  configurarEventListeners();
  
  atualizarExibicaoPendentes();
  
  if (navigator.onLine) {
    sincronizarFila();
  }
  
  window.addEventListener('online', () => {
    atualizarStatusConexao(true);
    sincronizarFila();
  });
  
  window.addEventListener('offline', () => {
    atualizarStatusConexao(false);
  });
  
  atualizarStatusConexao(navigator.onLine);
});

function mostrarModal(titulo, texto) {
  const modal = document.getElementById('processing-modal');
  const titleEl = document.getElementById('modal-status-title');
  const textEl = document.getElementById('modal-status-text');
  
  titleEl.textContent = titulo;
  textEl.textContent = texto;
  modal.classList.add('active');
}

function atualizarModal(titulo, texto) {
  const titleEl = document.getElementById('modal-status-title');
  const textEl = document.getElementById('modal-status-text');
  
  if (titleEl && titulo) titleEl.textContent = titulo;
  if (textEl && texto) textEl.textContent = texto;
}

function esconderModal() {
  const modal = document.getElementById('processing-modal');
  if (modal) modal.classList.remove('active');
}

function configurarEventListeners() {
  const form = document.getElementById('fuel-form');
  const imageUpload = document.getElementById('image-upload');
  const veiculo = document.getElementById('veiculo');
  const litros = document.getElementById('litros');
  const valorLitro = document.getElementById('valorLitro');
  const desconto = document.getElementById('desconto');
  const odometro = document.getElementById('odometro');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    processarEnvio();
  });

  form.addEventListener('reset', () => {
    setTimeout(() => resetarFormulario(), 0);
  });

  veiculo.addEventListener('change', (e) => {
    carregarOdometroVeiculo(e.target.value);
  });

  imageUpload.addEventListener('change', (e) => {
    processarImagensUpload(e.target.files);
  });

  valorLitro.addEventListener('input', (e) => {
    e.target.value = formatarMoeda(e.target.value);
    atualizarResumoCalculo();
  });

  desconto.addEventListener('input', (e) => {
    e.target.value = formatarMoeda(e.target.value);
    atualizarResumoCalculo();
  });

  litros.addEventListener('input', (e) => {
    e.target.value = formatarNumero(e.target.value);
    atualizarResumoCalculo();
  });

  odometro.addEventListener('input', (e) => {
    e.target.value = formatarNumeroDecimal(e.target.value);
  });
}

function formatarMoeda(valor) {
  valor = valor.replace(/\D/g, '');
  valor = (Number(valor) / 100).toFixed(2) + '';
  valor = valor.replace('.', ',');
  valor = valor.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return 'R$ ' + valor;
}

function formatarNumero(valor) {
  valor = valor.replace(/\D/g, '');
  valor = (Number(valor) / 100).toFixed(2) + '';
  valor = valor.replace('.', ',');
  valor = valor.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return valor;
}

function formatarNumeroDecimal(valor) {
  valor = valor.replace(/[^\d,.]/g, '');
  const partes = valor.split(/[.,]/);
  if (partes.length > 2) {
    valor = partes[0] + ',' + partes.slice(1).join('');
  } else if (partes.length === 2) {
    valor = partes[0] + ',' + partes[1];
  }
  return valor;
}

function parseMoeda(valor) {
  if (!valor) return 0;
  return Number(valor.replace(/[R$\s.]/g, '').replace(',', '.'));
}

function parseDecimal(valor) {
  if (!valor) return 0;
  return Number(valor.toString().replace(/\./g, '').replace(',', '.'));
}

function obterDimensoesImagem(base64) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ largura: img.width, altura: img.height });
    };
    img.src = base64;
  });
}

function carregarImagemBase64(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = function () {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = url;
  });
}

async function gerarPDF(dados) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const margin = 15;
  let y = 20;

  doc.setFillColor(0, 0, 0);
  doc.rect(0, 0, 210, 35, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  
  try {
    const logoBase64 = await carregarImagemBase64('./images/logo.png');
    doc.addImage(logoBase64, 'PNG', margin, 10, 40, 15);
  } catch(e) { console.warn('Logo não carregada no PDF'); }
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Relatório de Abastecimento', margin, 28);
  
  y = 50;
  doc.setTextColor(40, 40, 40);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Informações do Registro', margin, y);
  y += 2;
  doc.setLineWidth(0.5);
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, 195, y);
  y += 10;

  doc.setFontSize(11);
  const infoData = [
    ['ID do Registro:', dados.id],
    ['Data/Hora:', new Date(dados.timestamp).toLocaleString('pt-BR')],
    ['Motorista:', dados.motorista],
    ['Veículo:', dados.placa],
    ['N° Nota Fiscal:', dados.nota || 'Não informado'],
    ['Odômetro:', `${dados.odometro.toLocaleString('pt-BR')} km`],
    ['Fornecedor:', dados.fornecedor]
  ];

  infoData.forEach(row => {
    doc.setFont('helvetica', 'bold');
    doc.text(row[0], margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(row[1], margin + 40, y);
    y += 7;
  });

  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Valores do Abastecimento', margin, y);
  y += 2;
  doc.line(margin, y, 195, y);
  y += 10;

  doc.setFontSize(11);
  const valoresData = [
    ['Quantidade:', `${dados.litros.toLocaleString('pt-BR')} Litros`],
    ['Valor do Litro:', dados.valorLitro.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })],
    ['Desconto:', dados.desconto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })]
  ];

  valoresData.forEach(row => {
    doc.setFont('helvetica', 'bold');
    doc.text(row[0], margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(row[1], margin + 40, y);
    y += 7;
  });

  y += 3;
  doc.setFillColor(240, 240, 240);
  doc.rect(margin, y - 5, 180, 10, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('TOTAL:', margin + 2, y + 2);
  doc.text(dados.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), margin + 40, y + 2);

  y += 20;

  if (selectedImages && selectedImages.length > 0) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Fotos Anexadas', margin, y);
    y += 2;
    doc.line(margin, y, 195, y);
    y += 10;

    const maxImgWidth = 85;
    const maxImgHeight = 65;
    const spacing = 10;
    let imgX = margin;

    for (let i = 0; i < selectedImages.length; i++) {
      const dim = await obterDimensoesImagem(selectedImages[i].dataUrl);
      const aspect = dim.largura / dim.altura;
      let renderWidth = maxImgWidth;
      let renderHeight = renderWidth / aspect;
      if (renderHeight > maxImgHeight) {
        renderHeight = maxImgHeight;
        renderWidth = renderHeight * aspect;
      }
      if (y + renderHeight > 275) {
        doc.addPage();
        y = 20;
      }
      try {
        const centerX = imgX + (maxImgWidth - renderWidth) / 2;
        doc.addImage(selectedImages[i].dataUrl, 'JPEG', centerX, y, renderWidth, renderHeight);
      } catch (e) { console.error(e); }

      if (i % 2 === 0 && i < selectedImages.length - 1) {
        imgX = margin + maxImgWidth + spacing;
      } else {
        imgX = margin;
        y += maxImgHeight + spacing;
      }
    }
  }

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Página ${i} de ${pageCount} | Gerado em ${new Date().toLocaleDateString('pt-BR')}`, 105, 290, { align: 'center' });
  }

  return doc.output('blob');
}

async function processarEnvio() {
  if (isProcessing) return;

  try {
    isProcessing = true;
    const form = document.getElementById('fuel-form');
    
    if (!form.checkValidity()) {
      exibirMensagem('❌ Preencha todos os campos obrigatórios', 'error');
      isProcessing = false;
      return;
    }

    const litros = parseMoeda(document.getElementById('litros').value);
    const valorLitro = parseMoeda(document.getElementById('valorLitro').value);
    const desconto = parseMoeda(document.getElementById('desconto').value || '0');
    const total = (litros * valorLitro) - desconto;
    const odometroVal = parseDecimal(document.getElementById('odometro').value);
    
    // ID único robusto
    const uniqueId = 'REG-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

    const dados = {
      id: uniqueId,
      motorista: document.getElementById('motorista').value,
      placa: document.getElementById('veiculo').value,
      fornecedor: document.getElementById('fornecedor').value,
      nota: document.getElementById('nota').value,
      combustivel: 'Diesel',
      litros, valorLitro, desconto, total,
      odometro: odometroVal,
      data: new Date().toLocaleDateString('pt-BR'),
      timestamp: new Date().toISOString()
    };

    if (dados.odometro < ultimoOdometro) {
      exibirMensagem(`❌ Odômetro inválido (Mínimo: ${ultimoOdometro})`, 'error');
      isProcessing = false;
      return;
    }

    mostrarModal('Gerando relatório...', 'Estamos preparando o seu PDF de abastecimento.');
    
    const pdfBlob = await gerarPDF(dados);
    
    const pdfBase64 = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(pdfBlob);
    });

    const registroCompleto = { ...dados, pdfBase64 };
    if (selectedImages.length > 0) {
      registroCompleto.imagens = selectedImages.map((img, idx) => ({
        nome: `img_${idx + 1}.jpg`,
        dataUrl: img.dataUrl
      }));
    }

    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `abastecimento_${dados.placa}_${Date.now()}.pdf`;
    link.click();

    if (navigator.onLine) {
      atualizarModal('Enviando dados...', 'Salvando as informações na planilha da Transportadora Talismã.');
      
      const sucesso = await enviarParaAPI(registroCompleto);
      
      if (sucesso) {
        atualizarModal('Concluído!', 'Dados enviados com sucesso para a nuvem.');
        setTimeout(() => {
          esconderModal();
          exibirMensagem('✅ Registro enviado com sucesso!', 'success');
          resetarFormulario();
          isProcessing = false;
        }, 1500);
      } else {
        atualizarModal('Salvando localmente...', 'Houve um erro no envio, mas não se preocupe: seus dados foram salvos para sincronização posterior.');
        salvarNaFila(registroCompleto);
        setTimeout(() => {
          esconderModal();
          exibirMensagem('⚠️ Erro ao enviar. Salvo localmente para sincronizar depois.', 'warning');
          resetarFormulario();
          isProcessing = false;
        }, 2000);
      }
    } else {
      atualizarModal('Modo Offline', 'Você está sem internet. Seus dados foram salvos na fila e serão enviados automaticamente assim que você se conectar.');
      salvarNaFila(registroCompleto);
      setTimeout(() => {
        esconderModal();
        exibirMensagem('📴 Sem conexão. Dados salvos para sincronização automática.', 'warning');
        resetarFormulario();
        isProcessing = false;
      }, 2500);
    }

  } catch (erro) {
    console.error('❌ Erro no processamento:', erro);
    esconderModal();
    exibirMensagem('❌ Ocorreu um erro inesperado.', 'error');
    isProcessing = false;
  }
}

async function enviarParaAPI(dados) {
  try {
    const { km, km_por_litro, ...payload } = dados;
    
    const response = await fetch(API, {
      method: 'POST',
      mode: 'no-cors', 
      body: JSON.stringify(payload)
    });
    
    return true; 
  } catch (e) {
    console.error('Erro no fetch:', e);
    return false;
  }
}

function salvarNaFila(registro) {
  const fila = JSON.parse(localStorage.getItem('fila_abastecimento')) || [];
  if (!fila.some(f => f.id === registro.id)) {
    fila.push(registro);
    localStorage.setItem('fila_abastecimento', JSON.stringify(fila));
  }
  atualizarExibicaoPendentes();
}

async function sincronizarFila() {
  if (isSyncing || !navigator.onLine) return;

  try {
    isSyncing = true;
    const fila = JSON.parse(localStorage.getItem('fila_abastecimento')) || [];
    if (fila.length === 0) {
      isSyncing = false;
      atualizarExibicaoPendentes();
      return;
    }

    let sucessos = 0;
    const idsRemover = [];

    for (const item of fila) {
      const sucesso = await enviarParaAPI(item);
      if (sucesso) {
        idsRemover.push(item.id);
        sucessos++;
      } else {
        break;
      }
    }

    if (idsRemover.length > 0) {
      const filaAtualizada = JSON.parse(localStorage.getItem('fila_abastecimento')) || [];
      const novaFila = filaAtualizada.filter(f => !idsRemover.includes(f.id));
      localStorage.setItem('fila_abastecimento', JSON.stringify(novaFila));
    }

    atualizarExibicaoPendentes();

    if (sucessos > 0) {
      exibirMensagem(`${sucessos} registro(s) sincronizado(s) com sucesso!`, 'success');
    }
  } catch (e) {
    console.error('Erro na sincronização:', e);
  } finally {
    isSyncing = false;
  }
}

async function carregarDados() {
  const motoristasSalvos = JSON.parse(localStorage.getItem('dados_motoristas'));
  const veiculosSalvos = JSON.parse(localStorage.getItem('dados_veiculos'));

  if (motoristasSalvos || veiculosSalvos) {
    popularSelects(motoristasSalvos, veiculosSalvos);
    removerLoadingScreen();
  }

  if (navigator.onLine) {
    try {
      const [m, v] = await Promise.all([
        fetch(API + '?aba=motoristas').then(r => r.json()),
        fetch(API + '?aba=veiculos').then(r => r.json())
      ]);
      localStorage.setItem('dados_motoristas', JSON.stringify(m));
      localStorage.setItem('dados_veiculos', JSON.stringify(v));
      popularSelects(m, v);
    } catch (e) { 
      console.error('Erro ao carregar dados da API:', e); 
    } finally { 
      removerLoadingScreen(); 
    }
  }
}

function popularSelects(motoristas, veiculos) {
  const selM = document.getElementById('motorista');
  const selV = document.getElementById('veiculo');
  if (motoristas && selM) {
    selM.innerHTML = '<option value="" disabled selected>Selecione o Motorista</option>' + 
      motoristas.map(m => `<option value="${m.NOME}">${m.NOME}</option>`).join('');
  }
  if (veiculos && selV) {
    selV.innerHTML = '<option value="" disabled selected>Selecione o Veículo</option>' + 
      veiculos.map(v => `<option value="${v.PLACA}">${v.PLACA} - ${v.MODELO}</option>`).join('');
  }
}

async function carregarOdometroVeiculo(placa) {
  const input = document.getElementById('odometro');
  if (!placa || !input) return;
  
  input.placeholder = 'Buscando...';
  
  if (navigator.onLine) {
    try {
      const res = await fetch(API + '?aba=ultimoOdometro&placa=' + placa).then(r => r.json());
      ultimoOdometro = Number(res.odometro || 0);
      localStorage.setItem(`last_odo_${placa}`, ultimoOdometro);
    } catch (e) { 
      ultimoOdometro = Number(localStorage.getItem(`last_odo_${placa}`) || 0); 
    }
  } else {
    ultimoOdometro = Number(localStorage.getItem(`last_odo_${placa}`) || 0);
  }
  input.placeholder = `Último: ${ultimoOdometro.toLocaleString('pt-BR')}`;
}

function processarImagensUpload(files) {
  const container = document.getElementById('image-preview-container');
  if (!container) return;

  Array.from(files).forEach(file => {
    if (!['image/jpeg', 'image/png', 'image/jpg'].includes(file.type)) {
      exibirMensagem('❌ Apenas JPG e PNG são permitidos.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const preview = document.createElement('div');
      preview.className = 'image-preview-item';
      preview.innerHTML = `<img src="${dataUrl}"><button type="button" class="image-remove-btn">✕</button>`;
      
      preview.querySelector('button').onclick = () => {
        selectedImages = selectedImages.filter(img => img.file !== file);
        preview.remove();
      };
      
      container.appendChild(preview);
      selectedImages.push({ file, dataUrl });
    };
    reader.readAsDataURL(file);
  });
}

function atualizarResumoCalculo() {
  const l = parseMoeda(document.getElementById('litros').value);
  const v = parseMoeda(document.getElementById('valorLitro').value);
  const d = parseMoeda(document.getElementById('desconto').value);
  const sub = l * v;
  const tot = sub - d;
  
  const subEl = document.getElementById('subtotal');
  const descEl = document.getElementById('discount-display');
  const totEl = document.getElementById('total-display');

  if (subEl) subEl.textContent = sub.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  if (descEl) descEl.textContent = d.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  if (totEl) totEl.textContent = tot.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function atualizarStatusConexao(online) {
  const status = document.getElementById('connection-status');
  if (!status) return;

  const text = status.querySelector('.status-text');
  const info = document.getElementById('offline-info');
  const fila = JSON.parse(localStorage.getItem('fila_abastecimento')) || [];

  if (online) {
    status.className = 'connection-status online';
    if (text) text.textContent = 'Online';
    if (fila.length === 0 && info) info.style.display = 'none';
  } else {
    status.className = 'connection-status offline';
    if (text) text.textContent = 'Offline';
    if (info) info.style.display = 'block';
  }
  atualizarExibicaoPendentes();
}

function atualizarExibicaoPendentes() {
  const fila = JSON.parse(localStorage.getItem('fila_abastecimento')) || [];
  const section = document.getElementById('pending-section');
  const list = document.getElementById('pending-list');
  const count = document.getElementById('pending-count');
  const offlineInfo = document.getElementById('offline-info');

  if (fila.length === 0) {
    if (section) section.style.display = 'none';
    if (offlineInfo && navigator.onLine) offlineInfo.style.display = 'none';
    return;
  }

  if (section) section.style.display = 'block';
  if (offlineInfo) offlineInfo.style.display = 'block';

  if (count) count.textContent = `${fila.length} registro(s) aguardando sincronização`;
  if (list) {
    list.innerHTML = fila.map(item => `
      <div class="pending-item">
        <strong>${item.placa}</strong> - ${item.fornecedor}<br>
        <small>Total: R$ ${item.total.toFixed(2)} | ${new Date(item.timestamp).toLocaleDateString()}</small>
      </div>
    `).join('');
  }
}

function resetarFormulario() {
  const form = document.getElementById('fuel-form');
  if (form) form.reset();
  
  const container = document.getElementById('image-preview-container');
  if (container) container.innerHTML = '';
  
  selectedImages = [];
  atualizarResumoCalculo();
}

function removerLoadingScreen() {
  const ls = document.getElementById('loading-screen');
  if (ls) {
    ls.style.opacity = '0';
    setTimeout(() => ls.style.display = 'none', 500);
  }
}

function exibirMensagem(msg, tipo) {
  const box = document.getElementById('status-message');
  if (!box) return;
  box.textContent = msg;
  box.className = `status-message ${tipo}`;
  box.style.display = 'block';
  if (tipo !== 'warning') setTimeout(() => box.style.display = 'none', 5000);
}

setInterval(sincronizarFila, 60000);
