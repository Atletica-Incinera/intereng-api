import { UploadsService } from './uploads.service';

/**
 * Logotipo publicado com o front, em `apps/web/public/teams/`.
 *
 * Existe porque o MinIO ainda nao tem rota publica no gateway, e criar essa
 * rota depende de um acesso a VM que ninguem da organizacao do evento tem. As
 * dezesseis logos ja estavam versionadas no repositorio: fazer o evento
 * depender de uma rota que ninguem pode criar seria escolher o caminho mais
 * fragil por inercia.
 *
 * O formato e estreito de proposito. `logo` vai direto para o `src` de uma
 * <img> no navegador, entao qualquer valor aceito aqui e um valor que o app
 * vai buscar. Aceitar caminho livre abriria a porta para apontar a imagem de
 * uma equipe para fora do app.
 */
describe('UploadsService — logotipo estático', () => {
  it('aceita o caminho de um arquivo publicado com o app', () => {
    expect(UploadsService.ehLogoEstatica('/teams/alcateia.webp')).toBe(true);
    expect(UploadsService.ehLogoEstatica('/teams/thenebrosa.webp')).toBe(true);
    expect(UploadsService.ehLogoEstatica('/teams/sao-jose-2.webp')).toBe(true);
  });

  it('recusa caminho para fora da pasta de escudos', () => {
    expect(UploadsService.ehLogoEstatica('/outra-pasta/alcateia.webp')).toBe(false);
    expect(UploadsService.ehLogoEstatica('teams/alcateia.webp')).toBe(false);
    expect(UploadsService.ehLogoEstatica('/teams/sub/alcateia.webp')).toBe(false);
  });

  it('recusa travessia de diretório', () => {
    expect(UploadsService.ehLogoEstatica('/teams/../../etc/passwd.webp')).toBe(false);
    expect(UploadsService.ehLogoEstatica('/teams/..%2Falcateia.webp')).toBe(false);
  });

  it('recusa URL absoluta: o valor vai para o src de uma <img>', () => {
    expect(UploadsService.ehLogoEstatica('https://exemplo.invalido/x.webp')).toBe(false);
    expect(UploadsService.ehLogoEstatica('//exemplo.invalido/x.webp')).toBe(false);
    expect(UploadsService.ehLogoEstatica('javascript:alert(1)')).toBe(false);
    expect(UploadsService.ehLogoEstatica('data:image/webp;base64,AAAA')).toBe(false);
  });

  it('recusa outra extensão: a pasta publicada só tem webp', () => {
    expect(UploadsService.ehLogoEstatica('/teams/alcateia.png')).toBe(false);
    expect(UploadsService.ehLogoEstatica('/teams/alcateia.svg')).toBe(false);
    expect(UploadsService.ehLogoEstatica('/teams/alcateia')).toBe(false);
  });

  it('não confunde com a chave de objeto do storage, que segue outro caminho', () => {
    const chave = 'teams/team-1/logos/8f14e45f-ceea-4676-a0f4-4c5b9d1e2f3a.webp';
    expect(UploadsService.ehLogoEstatica(chave)).toBe(false);
    expect(UploadsService.ehLogoEstatica('/' + chave)).toBe(false);
  });
});
