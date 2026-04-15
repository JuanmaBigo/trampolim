// ═══════════════════════════════════════════════════════════════════
//  TRAMPOLIM — Google Apps Script (Backend)
//  Cole este código em: Extensões → Apps Script → (apaga tudo e cola)
//  Depois: Implantar → Nova implantação → Aplicativo Web
// ═══════════════════════════════════════════════════════════════════

const SHEET_NAME = 'Participantes';
const HIST_SHEET = 'Historico';

// ── PONTO DE ENTRADA ────────────────────────────────────────────────

function doGet(e) {
  const acao = e.parameter.acao;
  try {
    if (acao === 'listar')   return resp(listarParticipantes());
    if (acao === 'exportar') return resp(listarParticipantes());
    return resp({ erro: 'Ação não reconhecida' });
  } catch(err) {
    return resp({ erro: err.message });
  }
}

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const acao = body.acao;
  try {
    if (acao === 'login')    return resp(verificarLogin(body.user, body.pass));
    if (acao === 'salvar')   return resp(salvarParticipante(body.dados));
    if (acao === 'excluir')  return resp(excluirParticipante(body.id));
    if (acao === 'pontuar')  return resp(registrarPontuacao(body.id, body.pts, body.contexto));
    if (acao === 'virarmes') return resp(virarMes());
    return resp({ erro: 'Ação não reconhecida' });
  } catch(err) {
    return resp({ erro: err.message });
  }
}

// ── LOGIN ──────────────────────────────────────────────────────────
// Credenciais são salvas em: Apps Script → Configurações do projeto → Propriedades do script
// Adicione as propriedades:
//   EDITOR_USER = (seu usuário)
//   EDITOR_PASS = (sua senha)

function verificarLogin(user, pass) {
  const props = PropertiesService.getScriptProperties();
  const editorUser = props.getProperty('EDITOR_USER');
  const editorPass = props.getProperty('EDITOR_PASS');
  if (user === editorUser && pass === editorPass) {
    return { role: 'editor' };
  }
  return { erro: 'Usuário ou senha incorretos' };
}

function resp(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── PARTICIPANTES ───────────────────────────────────────────────────

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['id','nome','nascimento','celular','responsavel','celularResp',
                  'alergiaTipo','alergiaDesc','roupa','calcado','presente',
                  'oficina','sonho','autorizacao','pontos']);
    sh.getRange(1,1,1,15).setFontWeight('bold');
  }
  return sh;
}

function getHistSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(HIST_SHEET);
  if (!sh) {
    sh = ss.insertSheet(HIST_SHEET);
    sh.appendRow(['participanteId','data','pts','contexto']);
    sh.getRange(1,1,1,4).setFontWeight('bold');
  }
  return sh;
}

function listarParticipantes() {
  const sh = getSheet();
  const dados = sh.getDataRange().getValues();
  if (dados.length <= 1) return { participantes: [] };

  const cabecalho = dados[0];
  const historico = listarHistorico();

  const participantes = dados.slice(1).map(row => {
    const obj = {};
    cabecalho.forEach((col, i) => { obj[col] = row[i]; });
    obj.pontos = Number(obj.pontos) || 0;
    obj.autorizacao = obj.autorizacao === true || obj.autorizacao === 'true' || obj.autorizacao === 1;
    obj.historico = historico.filter(h => h.participanteId === obj.id);
    return obj;
  });

  return { participantes };
}

function listarHistorico() {
  const sh = getHistSheet();
  const dados = sh.getDataRange().getValues();
  if (dados.length <= 1) return [];
  const cab = dados[0];
  return dados.slice(1).map(row => {
    const obj = {};
    cab.forEach((col, i) => { obj[col] = row[i]; });
    obj.pts = Number(obj.pts) || 0;
    return obj;
  });
}

function salvarParticipante(dados) {
  const sh = getSheet();
  const todas = sh.getDataRange().getValues();
  const cab = todas[0];

  // Procura linha existente pelo id
  const linhas = todas.slice(1);
  const idx = linhas.findIndex(r => r[0] === dados.id);

  const row = cab.map(col => {
    if (col === 'autorizacao') return dados[col] ? true : false;
    if (col === 'pontos') return Number(dados[col]) || 0;
    return dados[col] !== undefined ? dados[col] : '';
  });

  if (idx >= 0) {
    // Atualiza linha existente (mantém pontos atuais da planilha)
    const pontosAtual = linhas[idx][cab.indexOf('pontos')];
    row[cab.indexOf('pontos')] = pontosAtual;
    sh.getRange(idx + 2, 1, 1, row.length).setValues([row]);
  } else {
    // Novo participante
    sh.appendRow(row);
  }

  return { ok: true };
}

function excluirParticipante(id) {
  const sh = getSheet();
  const dados = sh.getDataRange().getValues();
  for (let i = 1; i < dados.length; i++) {
    if (dados[i][0] === id) {
      sh.deleteRow(i + 1);
      // Remove histórico também
      const hs = getHistSheet();
      const hd = hs.getDataRange().getValues();
      for (let j = hd.length - 1; j >= 1; j--) {
        if (hd[j][0] === id) hs.deleteRow(j + 1);
      }
      return { ok: true };
    }
  }
  return { erro: 'Participante não encontrado' };
}

function registrarPontuacao(id, pts, contexto) {
  // Atualiza pontos na aba Participantes
  const sh = getSheet();
  const dados = sh.getDataRange().getValues();
  const cab = dados[0];
  const colPontos = cab.indexOf('pontos');

  for (let i = 1; i < dados.length; i++) {
    if (dados[i][0] === id) {
      const atual = Number(dados[i][colPontos]) || 0;
      const novo = Math.max(0, atual + pts);
      sh.getRange(i + 1, colPontos + 1).setValue(novo);
      break;
    }
  }

  // Registra no histórico
  const hs = getHistSheet();
  const data = new Date().toLocaleDateString('pt-BR');
  hs.appendRow([id, data, pts, contexto || 'geral']);

  return { ok: true };
}

function virarMes() {
  const sh = getSheet();
  const dados = sh.getDataRange().getValues();
  const cab = dados[0];
  const colPontos = cab.indexOf('pontos');

  const TIERS = [
    { min:0,   max:99,  rate:0 },
    { min:100, max:249, rate:3 },
    { min:250, max:499, rate:5 },
    { min:500, max:Infinity, rate:8 },
  ];

  function getTier(pts) {
    return TIERS.find(t => pts >= t.min && pts <= t.max) || TIERS[0];
  }

  let totalRendimento = 0;
  const hs = getHistSheet();
  const data = new Date().toLocaleDateString('pt-BR');

  for (let i = 1; i < dados.length; i++) {
    const id = dados[i][0];
    const pts = Number(dados[i][colPontos]) || 0;
    const rend = Math.round(pts * getTier(pts).rate / 100);
    if (rend > 0) {
      sh.getRange(i + 1, colPontos + 1).setValue(pts + rend);
      hs.appendRow([id, data, rend, 'rendimento']);
      totalRendimento += rend;
    }
  }

  return { ok: true, totalRendimento };
}
