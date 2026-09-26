# Pulso 90 Games Lab

## Objetivo
Laboratório técnico de jogos próprios do ecossistema Pulso 90. Não recebe depósitos, não processa saques e não oferece aposta com dinheiro real.

## Princípios do motor
- Matemática fixa por versão.
- Nenhuma alteração de probabilidade por usuário, saldo, tempo de sessão, sequência de perdas ou comportamento.
- Paytable e probabilidades versionadas.
- RNG criptográfico no laboratório público via Web Crypto.
- Build futuro certificável deve mover RNG e liquidação para RGS/backend controlado, com CSPRNG, logs imutáveis, versionamento e integração auditável.
- Toda alteração de componente crítico deve gerar nova versão e nova trilha de certificação aplicável.

## Jogos iniciais
1. Pulso Tiger — slot original, RTP teórico 96,00%.
2. Pulso Launch — crash original, edge matemático fixo de 3%.
3. Pulso Goal Duel — jogo virtual de quota fixa original, RTP por seleção ~95,9%.

## Benefícios
O laboratório usa Pontos Pulso sem valor monetário. Em eventual operação autorizada, qualquer programa de recompensa deve obedecer aos termos do operador e às regras da SPA. Não haverá bônus de entrada/depósito embutido no motor.

## Não reutilizar das versões antigas
- Dynamic RTP por jogador.
- “Fury win” após loss streak.
- Near-miss proposital baseado em retenção.
- Alteração de resultado por saldo, sessão ou histórico.
- Segredos hardcoded.
- Banco JSON como ledger financeiro.

## Próxima arquitetura certificável
Client -> API Gateway -> Game Session Service -> RGS -> RNG Service -> Settlement Ledger -> Audit Log
                                             -> Game Math Manifest
                                             -> Certification Artifacts

Status atual: LAB / NOT CERTIFIED / DEMO ONLY.
