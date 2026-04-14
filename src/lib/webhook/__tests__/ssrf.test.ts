import { validateUrl, SsrfError } from "../ssrf";

describe("validateUrl", () => {
  // URLs validas
  it("aceita URL HTTPS valida", () => {
    expect(() => validateUrl("https://api.example.com/webhook")).not.toThrow();
  });

  it("aceita URL HTTPS com porta", () => {
    expect(() => validateUrl("https://api.example.com:8443/webhook")).not.toThrow();
  });

  it("aceita URL HTTPS com path complexo", () => {
    expect(() => validateUrl("https://hooks.example.com/v1/webhooks/abc123")).not.toThrow();
  });

  // Protocolo
  it("rejeita URL HTTP (sem TLS)", () => {
    expect(() => validateUrl("http://api.example.com/webhook")).toThrow(SsrfError);
    expect(() => validateUrl("http://api.example.com/webhook")).toThrow(/non_https_protocol/);
  });

  it("rejeita URL FTP", () => {
    expect(() => validateUrl("ftp://api.example.com/file")).toThrow(SsrfError);
  });

  it("rejeita URL com protocolo file://", () => {
    expect(() => validateUrl("file:///etc/passwd")).toThrow(SsrfError);
  });

  // IPs internos / privados
  it("rejeita localhost", () => {
    expect(() => validateUrl("https://localhost/webhook")).toThrow(SsrfError);
    expect(() => validateUrl("https://localhost:3000/webhook")).toThrow(SsrfError);
  });

  it("rejeita 127.0.0.1 (loopback)", () => {
    expect(() => validateUrl("https://127.0.0.1/webhook")).toThrow(SsrfError);
  });

  it("rejeita ::1 (loopback IPv6)", () => {
    expect(() => validateUrl("https://[::1]/webhook")).toThrow(SsrfError);
  });

  it("rejeita 10.x.x.x (rede privada classe A)", () => {
    expect(() => validateUrl("https://10.0.0.1/webhook")).toThrow(SsrfError);
    expect(() => validateUrl("https://10.255.255.255/webhook")).toThrow(SsrfError);
  });

  it("rejeita 172.16-31.x.x (rede privada classe B)", () => {
    expect(() => validateUrl("https://172.16.0.1/webhook")).toThrow(SsrfError);
    expect(() => validateUrl("https://172.31.255.255/webhook")).toThrow(SsrfError);
  });

  it("aceita 172.32.x.x (fora do range privado)", () => {
    expect(() => validateUrl("https://172.32.0.1/webhook")).not.toThrow();
  });

  it("rejeita 192.168.x.x (rede privada classe C)", () => {
    expect(() => validateUrl("https://192.168.0.1/webhook")).toThrow(SsrfError);
    expect(() => validateUrl("https://192.168.255.255/webhook")).toThrow(SsrfError);
  });

  it("rejeita 169.254.x.x (link-local / metadata cloud)", () => {
    expect(() => validateUrl("https://169.254.169.254/latest/meta-data")).toThrow(SsrfError);
  });

  it("rejeita 0.0.0.0", () => {
    expect(() => validateUrl("https://0.0.0.0/webhook")).toThrow(SsrfError);
  });

  // Entradas invalidas
  it("rejeita string vazia", () => {
    expect(() => validateUrl("")).toThrow(SsrfError);
  });

  it("rejeita URL mal formada", () => {
    expect(() => validateUrl("not-a-url")).toThrow(SsrfError);
  });

  it("rejeita URL sem hostname", () => {
    // Node URL parser treats "https:///path" as hostname="path", so we test
    // a truly empty hostname scenario via an invalid URL pattern
    expect(() => validateUrl("https://")).toThrow(SsrfError);
  });
});

describe("ssrf — novos bloqueios via @nexusai360/webhook-routing", () => {
  it("bloqueia CGNAT 100.64.0.0/10", () => {
    expect(() => validateUrl("https://100.64.0.1/hook")).toThrow(SsrfError);
    expect(() => validateUrl("https://100.127.255.255/hook")).toThrow(SsrfError);
  });
  it("permite 100.0.0.1 e 100.128.0.1 (fora do CGNAT)", () => {
    expect(() => validateUrl("https://100.0.0.1/hook")).not.toThrow();
    expect(() => validateUrl("https://100.128.0.1/hook")).not.toThrow();
  });
  it("bloqueia IPv4-mapped IPv6 forma decimal apontando para privado", () => {
    expect(() => validateUrl("https://[::ffff:10.0.0.1]/hook")).toThrow(SsrfError);
    expect(() => validateUrl("https://[::ffff:127.0.0.1]/hook")).toThrow(SsrfError);
  });
  it("bloqueia IPv4-mapped IPv6 forma hex", () => {
    expect(() => validateUrl("https://[::ffff:0a00:0001]/hook")).toThrow(SsrfError); // 10.0.0.1
  });
  it("bloqueia hostnames extras (ip6-localhost, localhost.localdomain)", () => {
    expect(() => validateUrl("https://ip6-localhost/hook")).toThrow(SsrfError);
    expect(() => validateUrl("https://localhost.localdomain/hook")).toThrow(SsrfError);
    expect(() => validateUrl("https://broadcasthost/hook")).toThrow(SsrfError);
  });
});
