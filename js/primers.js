/* =========================================================
   VAPT CONSOLE — primers.js
   "Domain Basics" — a foundational explainer shown at the top of
   each domain's test-case list, written for an analyst who knows
   security testing in general but is new to *this specific* domain.
   Each primer covers: what you're actually looking at (architecture),
   the core request/response or trust-flow mechanics, the standard
   defensive layers you'll run into, and the vocabulary the test
   cases below assume you already know.
   Plain HTML strings (trusted, authored content — not escaped).
========================================================= */
const DOMAIN_PRIMERS = {

NET: `
  <h4>What network testing actually is</h4>
  <p>Network testing examines everything <b>below the application layer</b> — how machines find each other, how traffic is routed, which services are listening, and which of those services trust the network a little too much. A key mindset shift: most findings here are not software defects. They are services behaving exactly as designed, reachable from somewhere they should never have been reachable from.</p>

  <div class="primer-note key">
    <b>Core idea</b>
    Application testing asks "is this code written safely?" Network testing asks "should this thing even be reachable from here, and does it verify who is asking?" A perfectly-coded service on an unsegmented network is still a finding.
  </div>

  <h4>The OSI model — the part that matters in practice</h4>
  <p>You do not need all seven layers memorised, but you must be fluent in where an attack lives, because that determines the tool, the vantage point, and the fix.</p>
  <table class="primer-table">
    <tr><th>Layer</th><th>Addressing</th><th>Attacks that live here</th><th>Where you must be standing</th></tr>
    <tr><td><b>L2 — Data Link</b></td><td>MAC address</td><td>ARP spoofing, MAC flooding, VLAN hopping, rogue DHCP, STP takeover</td><td>Same broadcast domain (physically plugged in / same Wi-Fi)</td></tr>
    <tr><td><b>L3 — Network</b></td><td>IP address</td><td>IP spoofing, ICMP redirect, routing protocol injection, BGP hijack</td><td>Same segment, or a routing peer</td></tr>
    <tr><td><b>L4 — Transport</b></td><td>Port number</td><td>Port scanning, TCP session hijack, SYN flood</td><td>Anywhere with routable access</td></tr>
    <tr><td><b>L5-7 — Session/App</b></td><td>Service</td><td>Weak TLS, banner disclosure, default credentials, protocol abuse</td><td>Anywhere the service is reachable</td></tr>
  </table>
  <p>A practical consequence: <b>L2 attacks require proximity, L3+ attacks often do not.</b> If a finding needs the attacker on the same switch, its real-world risk profile is completely different from one exploitable from the internet — and your report should say so.</p>

  <h4>TCP vs UDP — and why it decides half your findings</h4>
  <div class="primer-split">
    <div>
      <table class="primer-table">
        <tr><th></th><th>TCP</th><th>UDP</th></tr>
        <tr><td><b>Connection</b></td><td>Handshake first (SYN → SYN/ACK → ACK)</td><td>None — just send</td></tr>
        <tr><td><b>Source address</b></td><td>Effectively verified by the handshake</td><td><b>Trivially forged</b></td></tr>
        <tr><td><b>Scanning</b></td><td>Fast, reliable, definitive</td><td>Slow, ambiguous (no reply ≠ closed)</td></tr>
        <tr><td><b>Typical services</b></td><td>SSH, HTTP, SMB, RDP, SMTP</td><td>DNS, NTP, SNMP, SSDP, syslog</td></tr>
      </table>
    </div>
    <div>
      <div class="primer-note tip">
        <b>Why this matters</b>
        Every amplification DDoS finding in this domain is UDP-based, and it is not a coincidence. No handshake means the server cannot verify the sender's address, so an attacker forges the victim's IP and the server unwittingly floods the victim with a much larger reply.
        <ul>
          <li><b>Amplification factor</b> = response size ÷ request size</li>
          <li>Bigger factor = more damage per attacker byte</li>
          <li>This is why exposed DNS / NTP / Memcached / SSDP keep appearing as findings</li>
        </ul>
      </div>
    </div>
  </div>

  <h4>Ports you should recognise on sight</h4>
  <p>You do not memorise these to look clever — you memorise them so that a scan result immediately suggests a hypothesis.</p>
  <table class="primer-table">
    <tr><th>Port</th><th>Service</th><th>First thought when you see it open</th></tr>
    <tr><td>21</td><td>FTP</td><td>Cleartext credentials; anonymous login? bounce attack?</td></tr>
    <tr><td>22</td><td>SSH</td><td>Check algorithms + version; key auth or password auth?</td></tr>
    <tr><td>23</td><td>Telnet</td><td>Cleartext admin protocol — finding on sight, no exceptions</td></tr>
    <tr><td>25 / 465 / 587</td><td>SMTP</td><td>Open relay? user enumeration via VRFY?</td></tr>
    <tr><td>53</td><td>DNS</td><td>Open resolver? zone transfer? tunnelling channel?</td></tr>
    <tr><td>135 / 139 / 445</td><td>RPC / NetBIOS / SMB</td><td>Null session, SMB signing, SMBv1, relay potential</td></tr>
    <tr><td>161</td><td>SNMP</td><td>Default community strings (<code>public</code> / <code>private</code>)</td></tr>
    <tr><td>389 / 636</td><td>LDAP / LDAPS</td><td>Anonymous bind = full org chart</td></tr>
    <tr><td>1433 / 3306 / 5432</td><td>MSSQL / MySQL / Postgres</td><td>Database exposed beyond its app tier — why?</td></tr>
    <tr><td>3389</td><td>RDP</td><td>Brute-force target; NLA enabled? patched for BlueKeep?</td></tr>
    <tr><td>5985 / 5986</td><td>WinRM</td><td>Remote command execution path if creds are obtained</td></tr>
    <tr><td>6379 / 11211 / 27017</td><td>Redis / Memcached / MongoDB</td><td>Historically no auth by default — assume open until proven otherwise</td></tr>
  </table>

  <h4>The three trust models that cause nearly everything</h4>
  <div class="primer-terms">
    <dl class="primer-term"><dt>Network-position trust</dt><dd>"If you can reach me, you must be allowed." SNMP community strings, unauthenticated management interfaces, internal-only APIs. The entire control is segmentation — and segmentation is usually weaker than assumed.</dd></dl>
    <dl class="primer-term"><dt>Protocol-level trust</dt><dd>ARP, DHCP, LLMNR, STP, OSPF and IPv6 Router Advertisements were designed for cooperative networks. Any device on the segment can speak them convincingly. There is no identity to verify.</dd></dl>
    <dl class="primer-term"><dt>Legacy compatibility trust</dt><dd>SMBv1, Telnet, SSLv3, RC4 survive because "something might still need it." Nobody ever confirms that something still exists. Compatibility outlives its justification.</dd></dl>
  </div>

  <h4>How an internal network attack actually unfolds</h4>
  <div class="primer-flow">
    <span>Passive listening</span><i>→</i><span>Host discovery</span><i>→</i><span>Port + service enum</span><i>→</i><span>Credential capture</span><i>→</i><span>Relay / crack</span><i>→</i><span>Lateral movement</span><i>→</i><span>Domain escalation</span>
  </div>
  <p>The classic internal chain is worth internalising because so many NET test cases are just one link in it: sit quietly and capture broadcast name-resolution traffic (LLMNR/NBT-NS) → obtain NTLM hashes → either crack them offline or relay them to a host that does not enforce SMB signing → land on that host → hunt for cached credentials or a Kerberoastable service account → escalate to Domain Admin. Each arrow in that chain is a separate, individually-fixable finding.</p>

  <h4>Defensive layers you will meet (or find missing)</h4>
  <table class="primer-table">
    <tr><th>Control</th><th>What it actually does</th><th>What it does <i>not</i> do</th></tr>
    <tr><td><b>Firewall</b></td><td>Allows/denies by IP, port, and connection state</td><td>Cannot tell a legitimate user from an attacker on an allowed port</td></tr>
    <tr><td><b>IDS / IPS</b></td><td>Matches traffic against known-bad signatures</td><td>Defeated by fragmentation, encryption, and novel payloads</td></tr>
    <tr><td><b>Segmentation (VLAN/zones)</b></td><td>Limits blast radius of one compromised host</td><td>Nothing, if inter-VLAN routing is unfiltered — a very common gap</td></tr>
    <tr><td><b>NAC / 802.1X</b></td><td>Authenticates the device before granting network access</td><td>Often bypassable via MAC allowlist fallback for printers/phones</td></tr>
  </table>

  <div class="primer-note warn">
    <b>Common beginner mistakes</b>
    <ul>
      <li><b>Reporting the scan, not the risk.</b> "Port 445 open" is not a finding. "SMB signing not required, allowing captured NTLM authentication to be relayed to this host" is a finding.</li>
      <li><b>Ignoring UDP.</b> It is slow and boring to scan, so people skip it — and miss the entire amplification and SNMP attack surface.</li>
      <li><b>Assuming IPv4 is the whole network.</b> IPv6 is enabled by default on modern hosts and frequently unmonitored, giving you an unguarded parallel network.</li>
      <li><b>Trusting version banners.</b> Banners are configurable and back-ported patches are common — confirm before claiming a CVE.</li>
      <li><b>Running loud L2 attacks without written scope.</b> ARP spoofing and MAC flooding degrade the network for real users. Get it in writing.</li>
    </ul>
  </div>

  <h4>Vocabulary check</h4>
  <div class="primer-terms">
    <dl class="primer-term"><dt>Reconnaissance</dt><dd>Discovering what exists. Passive = observing without sending anything (safe, undetectable). Active = probing directly (fast, noisy).</dd></dl>
    <dl class="primer-term"><dt>Enumeration</dt><dd>Extracting detail from something already found — versions, usernames, shares, policies. Recon finds the door; enumeration reads the label on it.</dd></dl>
    <dl class="primer-term"><dt>Pivoting</dt><dd>Using a compromised host's network position to reach things you could not reach directly. Also called tunnelling.</dd></dl>
    <dl class="primer-term"><dt>Lateral movement</dt><dd>Spreading host-to-host at a similar privilege level, usually with reused or captured credentials.</dd></dl>
    <dl class="primer-term"><dt>Privilege escalation</dt><dd>Going from a lower to higher access level. Vertical = user→admin. Horizontal = user→different user.</dd></dl>
    <dl class="primer-term"><dt>Man-in-the-middle (MITM)</dt><dd>Positioning yourself in the traffic path so you can read or modify it. On L2, usually via ARP or RA spoofing.</dd></dl>
  </div>
`,

WEB: `
  <h4>What web application testing actually is</h4>
  <p>Web testing examines the software sitting on top of the network — code that receives a request, does something with it (usually touching a database or another service), and returns a response. Nearly every finding reduces to one question: <b>does the server independently verify what this request is allowed to do, before it does it?</b></p>

  <div class="primer-note key">
    <b>The golden rule</b>
    Anything that happens in the browser is a suggestion, not a control. The user owns the browser completely — they can edit the HTML, disable the JavaScript, and craft the request by hand. A check that only exists client-side is a user-experience feature, never a security boundary.
  </div>

  <h4>The request / response cycle</h4>
  <p>Every single test case in this domain is a variation of: "what happens if I change part of this request in a way the developer did not anticipate?"</p>
  <div class="primer-flow">
    <span>Method</span><i>+</i><span>Path</span><i>+</i><span>Headers</span><i>+</i><span>Body</span><i>→</i><span>SERVER</span><i>→</i><span>Status + Headers + Body</span>
  </div>
  <table class="primer-table">
    <tr><th>Part of the request</th><th>What it carries</th><th>What you try changing</th></tr>
    <tr><td><b>Method</b></td><td>GET (fetch), POST (submit), PUT/PATCH (modify), DELETE</td><td>Swap the verb — access rules often only cover GET/POST</td></tr>
    <tr><td><b>Path / query</b></td><td>Which resource, plus parameters</td><td>IDs, traversal sequences, injected syntax</td></tr>
    <tr><td><b>Headers</b></td><td>Cookies, auth tokens, Host, Referer, Content-Type</td><td>Forge Host, strip auth, change content type, spoof X-Forwarded-For</td></tr>
    <tr><td><b>Body</b></td><td>Form fields or JSON</td><td>Add fields never shown in the UI, change types, duplicate keys</td></tr>
  </table>
  <p><b>Status codes worth reading as signals:</b> <code>200</code> success · <code>301/302</code> redirect (open redirect? SSRF pivot?) · <code>401</code> not authenticated · <code>403</code> authenticated but not permitted (a very interesting difference — it confirms the resource exists) · <code>404</code> not found · <code>500</code> server error (often leaks stack traces).</p>

  <h4>The architecture you are actually poking at</h4>
  <div class="primer-flow">
    <span>Browser</span><i>→</i><span>CDN / WAF</span><i>→</i><span>Load balancer</span><i>→</i><span>App server</span><i>→</i><span>Database / cache</span>
  </div>
  <p>Each hop is a place where a security decision is made correctly, made incorrectly, or not made at all. Crucially, <b>hops can disagree with each other</b> — and that disagreement is itself an entire vulnerability class. If the CDN parses a request one way and the app server parses it another way, you get cache poisoning and request smuggling. If the WAF checks the first copy of a duplicated parameter and the app uses the last one, you get filter bypass.</p>

  <h4>Sessions: how the server knows who you are</h4>
  <p>HTTP is stateless — the server does not inherently remember you between requests. Everything about authentication is built to work around that.</p>
  <table class="primer-table">
    <tr><th>Mechanism</th><th>How it works</th><th>Where it breaks</th></tr>
    <tr><td><b>Session cookie</b></td><td>Server stores session state; cookie holds only a random ID</td><td>Predictable IDs, no rotation at login (fixation), missing HttpOnly/Secure/SameSite flags</td></tr>
    <tr><td><b>JWT (stateless token)</b></td><td>Token itself carries the claims, protected by a signature</td><td><code>alg:none</code> accepted, weak HMAC secret, algorithm confusion, no server-side revocation</td></tr>
    <tr><td><b>OAuth 2.0</b></td><td>Delegated login; a code is exchanged for an access token</td><td>Loose <code>redirect_uri</code> matching, missing <code>state</code> parameter (CSRF on the login flow)</td></tr>
    <tr><td><b>SAML</b></td><td>Signed XML assertion from an identity provider</td><td>Signature not verified, or verified on a different node than the one actually read (wrapping)</td></tr>
  </table>
  <div class="primer-note tip">
    <b>Cookie flags, in one line each</b>
    <ul>
      <li><code>HttpOnly</code> — JavaScript cannot read it, so an XSS bug cannot steal the session directly.</li>
      <li><code>Secure</code> — only ever sent over HTTPS, so it cannot leak on a downgraded connection.</li>
      <li><code>SameSite</code> — controls whether the cookie rides along on cross-site requests; the primary structural defence against CSRF.</li>
    </ul>
  </div>

  <h4>Same-origin policy and CORS</h4>
  <p>By default a browser will not let JavaScript from site A <b>read</b> the response from site B. This single rule is what stops any random website from reading your logged-in email. An "origin" is the exact combination of <b>scheme + host + port</b> — <code>https://a.com</code> and <code>http://a.com</code> are different origins, and so are <code>a.com</code> and <code>sub.a.com</code>.</p>
  <p><b>CORS</b> is how a server deliberately opts out of that protection for chosen origins. It loosens security; it never tightens it. The classic critical misconfiguration is reflecting whatever <code>Origin</code> the requester sent back in <code>Access-Control-Allow-Origin</code>, combined with <code>Access-Control-Allow-Credentials: true</code> — which effectively means "any website may read this user's private data."</p>
  <div class="primer-note warn">
    <b>The distinction people get wrong</b>
    The same-origin policy blocks <i>reading</i> the response — it does not block <i>sending</i> the request. That is precisely why CSRF exists: the malicious site cannot see the answer, but the state-changing action already happened.
  </div>

  <h4>Injection — one pattern, many names</h4>
  <p>Every injection flaw is the same underlying mistake: <b>untrusted input crosses a boundary and is interpreted as instructions instead of data.</b> Learn the pattern once and the variants become obvious.</p>
  <table class="primer-table">
    <tr><th>Name</th><th>Interpreter being tricked</th><th>The correct fix</th></tr>
    <tr><td>SQL injection</td><td>Database query engine</td><td>Parameterised queries — never string concatenation</td></tr>
    <tr><td>Command injection</td><td>Operating-system shell</td><td>Pass arguments as an array; avoid shell invocation entirely</td></tr>
    <tr><td>XSS</td><td>Browser's HTML/JS parser</td><td>Context-aware output encoding + CSP</td></tr>
    <tr><td>SSTI</td><td>Server-side template engine</td><td>Never build the template from user input; pass data as variables</td></tr>
    <tr><td>LDAP / XPath / NoSQL</td><td>Their respective query parsers</td><td>Escaping and strict type validation</td></tr>
    <tr><td>XXE</td><td>XML parser</td><td>Disable external entity resolution</td></tr>
  </table>
  <p><b>XSS types worth separating:</b> <i>Reflected</i> — payload comes in the request and bounces straight back (needs a victim to click a crafted link). <i>Stored</i> — payload is saved server-side and fires for everyone who views it (far more severe). <i>DOM-based</i> — never touches the server at all; the page's own JavaScript reads something attacker-controlled (like the URL fragment) and writes it into the page, which means server-side filters and WAFs never even see it.</p>

  <h4>Access control — the highest-value area to test</h4>
  <p>Authentication and authorisation are different questions, and conflating them is the single most common root cause in this domain.</p>
  <div class="primer-terms">
    <dl class="primer-term"><dt>Authentication (AuthN)</dt><dd>"Who are you?" Proven once at login.</dd></dl>
    <dl class="primer-term"><dt>Authorisation (AuthZ)</dt><dd>"Are you allowed to do <i>this specific thing</i>, to <i>this specific object</i>?" Must be re-checked on every single request.</dd></dl>
    <dl class="primer-term"><dt>IDOR / BOLA</dt><dd>Object identifier accepted without an ownership check. Swap the ID, get someone else's data.</dd></dl>
    <dl class="primer-term"><dt>Vertical escalation</dt><dd>Regular user reaching admin functionality — usually because the button was hidden rather than the endpoint protected.</dd></dl>
    <dl class="primer-term"><dt>Horizontal escalation</dt><dd>Reaching a peer user's data at the same privilege level. Almost always an IDOR.</dd></dl>
    <dl class="primer-term"><dt>Mass assignment</dt><dd>Endpoint binds the whole request body onto the model, letting you set fields like <code>role</code> that the UI never exposed.</dd></dl>
  </div>

  <div class="primer-note warn">
    <b>Common beginner mistakes</b>
    <ul>
      <li><b>Testing only through the UI.</b> The UI shows you the intended path. Findings live off it — use an intercepting proxy and edit requests directly.</li>
      <li><b>Treating a WAF block as "not vulnerable."</b> It means your payload was blocked, not that the bug is absent. Change encoding and try again.</li>
      <li><b>Testing with one account.</b> Access-control bugs need two accounts to prove: log in as A, capture a request, replay it with B's session.</li>
      <li><b>Reporting self-XSS as XSS.</b> If the only victim is someone pasting a payload into their own browser console, there is no attack path.</li>
      <li><b>Stopping at reflection.</b> Input appearing in the response is not XSS until it actually executes — check the context and the encoding.</li>
      <li><b>Ignoring business logic.</b> No scanner finds "apply the discount code twice" or "skip the payment step." Those need you to understand the workflow.</li>
    </ul>
  </div>
`,

API: `
  <h4>What API testing actually is</h4>
  <p>API testing is web testing with the HTML stripped away — you talk directly to the backend that a web or mobile front-end would normally talk to on your behalf. That is exactly what makes it productive: there is no browser quietly enforcing same-origin policy, no UI hiding fields, and no client-side validation standing between you and the endpoint. You see and control everything the front-end would have sent.</p>

  <div class="primer-note key">
    <b>Core idea</b>
    Assume the front-end does not exist. Every API test case here is written from the position of someone calling the endpoint directly with arbitrary parameters, arbitrary headers, and any account they happen to hold. If a rule is only enforced by the app's own screens, it is not enforced.
  </div>

  <h4>The three API styles you will meet</h4>
  <table class="primer-table">
    <tr><th></th><th>REST</th><th>GraphQL</th><th>SOAP</th></tr>
    <tr><td><b>Shape</b></td><td>Many URLs, verbs map to actions</td><td>One endpoint, client specifies the query</td><td>One endpoint, XML envelopes</td></tr>
    <tr><td><b>Discovery</b></td><td>Swagger/OpenAPI spec, or guesswork</td><td>Introspection — often gives the entire schema</td><td>WSDL file describes every operation</td></tr>
    <tr><td><b>Signature risk</b></td><td>BOLA on <code>/users/{id}</code> style paths</td><td>Nested-query DoS, per-resolver authorisation gaps, batching to bypass rate limits</td><td>XXE and XML parser attacks</td></tr>
    <tr><td><b>Rate limiting</b></td><td>One request = one operation</td><td><b>One request can hold hundreds of operations</b></td><td>One request = one operation</td></tr>
  </table>
  <div class="primer-note tip">
    <b>Why GraphQL deserves special attention</b>
    Three of its properties compound: introspection hands you a complete map of the attack surface; aliasing lets you pack many operations into a single HTTP request, sailing past limiters that count requests; and authorisation must be enforced per-resolver, so a single nested query can reach an object whose parent was checked but whose children were not.
  </div>

  <h4>How APIs prove who you are</h4>
  <table class="primer-table">
    <tr><th>Mechanism</th><th>How it works</th><th>What to test</th></tr>
    <tr><td><b>API key</b></td><td>Static secret sent with every request</td><td>Leaked in JS bundles, mobile apps, or Git history; no expiry; over-scoped</td></tr>
    <tr><td><b>Bearer / JWT</b></td><td>Signed token validated on each request</td><td><code>alg:none</code>, weak HMAC secret, <code>jku</code>/<code>kid</code> manipulation, no revocation</td></tr>
    <tr><td><b>OAuth 2.0</b></td><td>Short-lived access token issued by an auth server</td><td>Redirect URI validation, missing <code>state</code>, implicit flow leaking tokens in URLs</td></tr>
    <tr><td><b>mTLS</b></td><td>Both sides present certificates</td><td>Strong when done right; check the server actually validates the client cert</td></tr>
  </table>
  <p>Anatomy of a JWT worth knowing on sight: three base64 segments separated by dots — <code>header.payload.signature</code>. The header and payload are <b>encoded, not encrypted</b> — anyone can read them. The only thing standing between a user and a forged admin token is the signature check, which is precisely why so many JWT findings are about tricking the server into skipping or mis-performing that check.</p>

  <h4>OWASP API Top 10 — the shape of this domain</h4>
  <table class="primer-table">
    <tr><th>Issue</th><th>Plain meaning</th></tr>
    <tr><td><b>BOLA</b> (Broken Object Level Auth)</td><td>Swap an object ID, get someone else's object. The single most common API finding.</td></tr>
    <tr><td><b>Broken Authentication</b></td><td>Weak or bypassable login, token, or reset flows.</td></tr>
    <tr><td><b>BOPLA</b> (Property Level Auth)</td><td>You own the object, but can read or write fields you should not — excessive data exposure and mass assignment combined.</td></tr>
    <tr><td><b>Unrestricted Resource Consumption</b></td><td>No cap on page size, upload size, or query cost — DoS, or a runaway bill.</td></tr>
    <tr><td><b>BFLA</b> (Function Level Auth)</td><td>A regular user can call an admin endpoint directly.</td></tr>
    <tr><td><b>Unrestricted Access to Sensitive Business Flows</b></td><td>Automation abuse: bulk-buying stock, mass account creation, coupon draining.</td></tr>
    <tr><td><b>SSRF</b></td><td>API fetches a URL you supply, letting you reach internal services and cloud metadata.</td></tr>
    <tr><td><b>Improper Inventory Management</b></td><td>Forgotten <code>/v1/</code>, staging, and undocumented endpoints still live and less protected.</td></tr>
  </table>

  <h4>The trust boundary that keeps breaking</h4>
  <div class="primer-flow">
    <span>Client sends request</span><i>→</i><span>Gateway: authN + rate limit</span><i>→</i><span>Service: authZ + validation</span><i>→</i><span>Data</span>
  </div>
  <p>A recurring architectural failure: the gateway authenticates, and every backend service then <b>assumes</b> anything reaching it was already checked. That assumption breaks the moment a service is reachable directly, or the gateway performs only a shallow check. Each service must independently verify who is calling and whether they may touch the specific object requested.</p>

  <h4>SSRF — why it is disproportionately severe in APIs</h4>
  <p>When an API accepts a URL (webhook validation, link preview, remote import) and fetches it server-side, the request originates from <i>inside</i> the network perimeter. In cloud environments the highest-value target is the instance metadata endpoint, which can hand out temporary credentials to anything running on that host. Naive fixes fail because attackers use redirects, DNS names that resolve to internal addresses, alternate IP encodings, and DNS rebinding — which is why an allowlist of permitted destinations beats a blocklist of forbidden ones every time.</p>

  <div class="primer-note warn">
    <b>Common beginner mistakes</b>
    <ul>
      <li><b>Testing with a single account.</b> BOLA is invisible with one user — you need two accounts and a swapped ID to prove it.</li>
      <li><b>Only testing documented endpoints.</b> The spec describes the intended surface; old versions and internal routes are where findings live.</li>
      <li><b>Missing over-exposure in responses.</b> The UI showing three fields does not mean the API returned three fields — read the raw JSON.</li>
      <li><b>Assuming a rate limit works because it exists.</b> Test rotation of IPs, keys, header spoofing, path casing, and GraphQL batching.</li>
      <li><b>Ignoring HTTP method swaps.</b> Access rules frequently cover GET and POST and forget PUT, PATCH, DELETE, and HEAD.</li>
      <li><b>Treating a 403 as a dead end.</b> It confirms the object exists — try a different method, version, or path encoding.</li>
    </ul>
  </div>
`,

LLM: `
  <h4>What LLM application testing actually is</h4>
  <p>This is the newest and least standardised domain here. You are testing an application built <i>around</i> a large language model, where the model itself is a component with genuinely novel failure modes — not just another backend service. The core shift is this: traditional applications keep instructions (code) and data (user input) in separate, well-defined channels. LLM applications collapse both into a single channel — natural-language text — and almost every finding here descends from that collapse.</p>

  <div class="primer-note key">
    <b>Core idea</b>
    In a normal app, an attacker must find a bug to make their data become instructions. In an LLM app, data and instructions are already the same thing by design. You are not looking for a parsing flaw — you are testing whether the application built any boundary at all around a component that fundamentally cannot enforce one itself.
  </div>

  <h4>How an LLM application is assembled</h4>
  <div class="primer-flow">
    <span>System prompt</span><i>+</i><span>Retrieved docs (RAG)</span><i>+</i><span>User input</span><i>→</i><span>MODEL</span><i>→</i><span>Output handling</span><i>→</i><span>Tool calls / rendering</span>
  </div>
  <table class="primer-table">
    <tr><th>Component</th><th>What it is</th><th>Why it matters to you</th></tr>
    <tr><td><b>System prompt</b></td><td>Developer-written instructions defining persona and rules, invisible to the user</td><td>Hidden, but not secret. Often misused to store business logic or even keys</td></tr>
    <tr><td><b>Context window</b></td><td>The total text the model can consider at once</td><td>Everything shares one space — that is why separation fails</td></tr>
    <tr><td><b>RAG pipeline</b></td><td>Fetches documents from a knowledge base and injects them as context</td><td>Documents are untrusted input; source permissions rarely carry over</td></tr>
    <tr><td><b>Tool / function calling</b></td><td>Model output triggers a real action — query, email, API call</td><td>Turns text manipulation into command execution</td></tr>
    <tr><td><b>Guardrails</b></td><td>Filters on input or output</td><td>Probabilistic, not deterministic — you are finding gaps in a fuzzy boundary</td></tr>
  </table>

  <h4>Prompt injection — direct vs indirect</h4>
  <table class="primer-table">
    <tr><th></th><th>Direct</th><th>Indirect</th></tr>
    <tr><td><b>Who supplies the payload</b></td><td>The user, typing it themselves</td><td>A third party, hidden in content the model reads</td></tr>
    <tr><td><b>Delivery</b></td><td>Chat box</td><td>A web page, PDF, email, or indexed document</td></tr>
    <tr><td><b>Victim</b></td><td>Usually the app's own restrictions</td><td>Another user, who never sees anything happen</td></tr>
    <tr><td><b>Severity driver</b></td><td>Bypassing content rules</td><td>Attacker never interacts with the app directly — this is the dangerous one</td></tr>
  </table>
  <p>Indirect injection is the one to internalise. If an assistant summarises a webpage, that page's text enters the same context window as the developer's instructions. Text placed there by an attacker can be followed as an instruction — and the user who asked for a summary has no idea anything occurred.</p>

  <h4>Why classic defences do not transfer</h4>
  <div class="primer-terms">
    <dl class="primer-term"><dt>No parser to harden</dt><dd>There is no grammar separating code from data. You cannot "escape" natural language, because the boundary is semantic, not syntactic.</dd></dl>
    <dl class="primer-term"><dt>Filters are statistical</dt><dd>Guardrails classify likelihood, not correctness. Rephrasing, encoding, translating, or role-playing can move a payload past them.</dd></dl>
    <dl class="primer-term"><dt>Non-determinism</dt><dd>The same payload may work one time in five. A single failed attempt does not prove the app is safe — retry before concluding.</dd></dl>
    <dl class="primer-term"><dt>Prompts are not access control</dt><dd>"Never reveal X" is an instruction, not a permission boundary. If the model can see it, treat it as disclosable.</dd></dl>
  </div>

  <h4>The severity ladder</h4>
  <p>Impact here scales almost entirely with what the model is wired to do. Establish this early — it determines whether a finding is cosmetic or critical.</p>
  <div class="primer-flow">
    <span>Chat only</span><i>→</i><span>Reads private data (RAG)</span><i>→</i><span>Renders output as HTML</span><i>→</i><span>Calls tools / APIs</span><i>→</i><span>Autonomous agent</span>
  </div>
  <table class="primer-table">
    <tr><th>Capability</th><th>Prompt injection becomes...</th></tr>
    <tr><td>Text output only</td><td>Content-policy bypass — often low impact</td></tr>
    <tr><td>Retrieval over private documents</td><td>Data exfiltration across users or tenants</td></tr>
    <tr><td>Output rendered unsanitised</td><td>Classic XSS, with the model as the injection vector</td></tr>
    <tr><td>Tool calling</td><td>Command execution with the application's own privileges</td></tr>
    <tr><td>Autonomous multi-step agent</td><td>Chained actions, unbounded spend, real-world side effects</td></tr>
  </table>

  <div class="primer-note tip">
    <b>Testing angles worth trying first</b>
    <ul>
      <li>Ask the model to repeat, summarise, or translate its own instructions — system prompt leakage is fast to check and often succeeds.</li>
      <li>Establish which tools exist; ask the model directly what it can do, then test whether each action is authorised outside the model.</li>
      <li>Plant an instruction inside content the app will ingest (a document, a profile field, a page it fetches) — that is indirect injection.</li>
      <li>Probe tenant isolation in RAG: ask for information only another user's documents would contain.</li>
      <li>Check whether output is rendered as raw HTML or Markdown — image tags pointing at attacker servers are a classic exfiltration channel.</li>
    </ul>
  </div>

  <div class="primer-note warn">
    <b>Common beginner mistakes</b>
    <ul>
      <li><b>Reporting a jailbreak as critical with no impact path.</b> Making a chatbot say something rude is not a security finding unless it leads somewhere.</li>
      <li><b>Testing once and concluding.</b> Model responses vary — repeat before declaring either success or safety.</li>
      <li><b>Ignoring the non-chat surfaces.</b> The API behind the chat window, the RAG index, and the tool layer each have their own conventional vulnerabilities.</li>
      <li><b>Forgetting the model output is untrusted input downstream.</b> Anything consuming it needs the same validation you would apply to raw user input.</li>
      <li><b>Missing cost-based denial of service.</b> Token consumption is a real availability and financial risk, not a theoretical one.</li>
    </ul>
  </div>
`,

CLOUD: `
  <h4>What cloud testing actually is</h4>
  <p>Cloud testing is overwhelmingly about <b>configuration, not code</b>. The provider's physical servers, hypervisors, and network fabric are their responsibility and are generally out of scope. What you assess is how the customer configured the services built on top — and cloud misconfiguration is consistently among the highest-volume causes of real-world breaches, precisely because there is so much surface area to get wrong and so little friction in getting it wrong.</p>

  <div class="primer-note key">
    <b>Core idea</b>
    On-premises, the network is the primary boundary — if you cannot route to it, you cannot reach it. In cloud, <b>identity is the primary boundary</b>. A misconfigured IAM policy can expose a resource to the entire internet with no network control able to stop it. Learn to think in permissions first, network second.
  </div>

  <h4>The Shared Responsibility Model</h4>
  <p>This is the single most important concept in cloud security, and it shifts by service model. Every finding in this domain lives on the customer's side of this line.</p>
  <table class="primer-table">
    <tr><th>Responsibility</th><th>IaaS</th><th>PaaS</th><th>SaaS</th></tr>
    <tr><td>Physical / hypervisor</td><td>Provider</td><td>Provider</td><td>Provider</td></tr>
    <tr><td>OS patching</td><td><b>Customer</b></td><td>Provider</td><td>Provider</td></tr>
    <tr><td>Runtime / middleware</td><td><b>Customer</b></td><td>Provider</td><td>Provider</td></tr>
    <tr><td>Application code</td><td><b>Customer</b></td><td><b>Customer</b></td><td>Provider</td></tr>
    <tr><td>Access configuration (IAM)</td><td><b>Customer</b></td><td><b>Customer</b></td><td><b>Customer</b></td></tr>
    <tr><td>Data</td><td><b>Customer</b></td><td><b>Customer</b></td><td><b>Customer</b></td></tr>
  </table>
  <p>Notice the bottom two rows never move. <b>Access configuration and data are always the customer's problem</b>, no matter how managed the service is — which is why they account for most findings.</p>

  <h4>IAM — the concept underneath almost everything</h4>
  <div class="primer-terms">
    <dl class="primer-term"><dt>Principal</dt><dd>The thing making a request — a user, a group, or a workload/service identity.</dd></dl>
    <dl class="primer-term"><dt>Policy</dt><dd>A document (usually JSON) stating which actions are allowed on which resources, under which conditions.</dd></dl>
    <dl class="primer-term"><dt>Role</dt><dd>A set of permissions that is <i>assumed</i> temporarily rather than tied to a permanent credential. Preferred over static keys.</dd></dl>
    <dl class="primer-term"><dt>Trust policy</dt><dd>Defines <i>who</i> may assume a role. Loosely scoped trust policies are a recurring critical finding.</dd></dl>
    <dl class="primer-term"><dt>Least privilege</dt><dd>The standard everything is measured against, and the standard almost every environment drifts away from over time.</dd></dl>
    <dl class="primer-term"><dt>Privilege escalation path</dt><dd>Chaining individually-reasonable permissions into an unintended one — e.g. permission to edit your own role's policy.</dd></dl>
  </div>

  <h4>The building blocks you will keep encountering</h4>
  <table class="primer-table">
    <tr><th>Service type</th><th>AWS / Azure / GCP</th><th>What typically goes wrong</th></tr>
    <tr><td>Object storage</td><td>S3 / Blob / Cloud Storage</td><td>Public read or write; sensitive backups exposed; predictable bucket names</td></tr>
    <tr><td>Virtual network</td><td>VPC + Security Groups / NSG / VPC firewall</td><td><code>0.0.0.0/0</code> on admin ports; default VPC used in production</td></tr>
    <tr><td>Secrets store</td><td>Secrets Manager / Key Vault / Secret Manager</td><td>Over-broad read permissions; secrets duplicated into env vars anyway</td></tr>
    <tr><td>Serverless</td><td>Lambda / Functions / Cloud Functions</td><td>Secrets in plaintext env vars; over-privileged execution role; no cost cap</td></tr>
    <tr><td>Metadata service</td><td>IMDS / IMDS / metadata server</td><td>Reachable via SSRF, hands out temporary credentials</td></tr>
    <tr><td>Managed Kubernetes</td><td>EKS / AKS / GKE</td><td>Privileged pods, exposed kubelet, over-permissive RBAC</td></tr>
  </table>

  <div class="primer-note tip">
    <b>Instance metadata — the SSRF force multiplier</b>
    Every major cloud runs a metadata endpoint reachable only from inside an instance, which returns that instance's temporary credentials. This is why an SSRF bug in a cloud-hosted app is routinely critical rather than moderate: the server fetches a URL you control, you point it at metadata, and you walk away with working cloud credentials. The mitigation is enforcing the newer session-token-based metadata protocol, which defeats naive SSRF.
  </div>

  <h4>How a cloud compromise typically chains</h4>
  <div class="primer-flow">
    <span>Exposed asset or leaked key</span><i>→</i><span>Obtain credentials</span><i>→</i><span>Enumerate own permissions</span><i>→</i><span>Escalate via policy gap</span><i>→</i><span>Access data / persist</span>
  </div>
  <p>Note the third step: the first thing an attacker does with cloud credentials is ask the platform what those credentials can do. That is a normal, logged API call — which is exactly why detection findings around unusual enumeration matter as much as prevention findings.</p>

  <h4>Why cloud misconfiguration is so persistent</h4>
  <div class="primer-terms">
    <dl class="primer-term"><dt>Speed over review</dt><dd>"Make it public while I test" is a two-click action and reverting it is a task nobody is assigned.</dd></dl>
    <dl class="primer-term"><dt>Infrastructure as Code</dt><dd>Terraform and CloudFormation make configuration repeatable — including mistakes, deployed identically everywhere.</dd></dl>
    <dl class="primer-term"><dt>Sprawl and drift</dt><dd>Accounts, regions, and resources multiply faster than inventory does. Nobody can secure what nobody has listed.</dd></dl>
    <dl class="primer-term"><dt>Wildcards are easier</dt><dd>Writing <code>Action: "*"</code> always works. Writing the minimum required list takes real effort and ongoing maintenance.</dd></dl>
  </div>

  <div class="primer-note warn">
    <b>Common beginner mistakes</b>
    <ul>
      <li><b>Testing the provider instead of the customer.</b> Attacking the hypervisor or platform is out of scope and often prohibited — read the provider's testing policy before starting.</li>
      <li><b>Checking one region.</b> Resources hide in regions the organisation forgot it enabled.</li>
      <li><b>Confusing "not publicly accessible" with "secure."</b> A bucket locked down to any authenticated user of that cloud is effectively public.</li>
      <li><b>Ignoring the metadata endpoint when an SSRF is found.</b> That is usually where a moderate finding becomes a critical one.</li>
      <li><b>Reviewing only the live console.</b> The IaC templates are where the misconfiguration originates and where the fix must land, or it will simply redeploy.</li>
      <li><b>Overlooking cost as an impact.</b> Unbounded serverless invocation is a genuine availability and financial risk.</li>
    </ul>
  </div>
`,

MOBILE: `
  <h4>What mobile testing actually is</h4>
  <p>Mobile testing spans three attack surfaces that only appear together in this domain: the <b>client binary</b> (a real application on hardware you physically hold, unlike server-side web code), <b>local storage on the device</b> (files, databases, keychains — all recoverable if the device is rooted, backed up, or lost), and the <b>network traffic</b> to the backend (which underneath the mobile-specific tooling is usually just an API, tested exactly like the API domain).</p>

  <div class="primer-note key">
    <b>Core idea</b>
    In web testing the client is untrusted but you cannot see the server. In mobile testing the client is untrusted <i>and you own it completely</i> — you can decompile it, hook its functions at runtime, read its files, and rewrite its logic. Anything the app decides locally, you can change. Every security decision must therefore be re-made server-side.
  </div>

  <h4>The three surfaces, and what you do on each</h4>
  <table class="primer-table">
    <tr><th>Surface</th><th>What you are looking for</th><th>Typical tooling</th></tr>
    <tr><td><b>Static (the binary)</b></td><td>Hardcoded secrets, endpoint URLs, weak crypto, debug flags, exported components</td><td>Unzip the package, decompile, grep strings</td></tr>
    <tr><td><b>Dynamic (running app)</b></td><td>Bypassing biometric/root/pinning checks, runtime logic tampering, memory inspection</td><td>Instrumentation frameworks that hook live function calls</td></tr>
    <tr><td><b>Local storage</b></td><td>Plaintext credentials, tokens, cached PII, logs, backup inclusion</td><td>Pull the app's data directory on a rooted/jailbroken device</td></tr>
    <tr><td><b>Network</b></td><td>Everything in the API domain, plus certificate pinning</td><td>Intercepting proxy, once pinning is dealt with</td></tr>
  </table>
  <div class="primer-note tip">
    <b>Start static — it is cheap and productive</b>
    An Android APK or iOS IPA is a structured archive. Unpacking it and searching for strings routinely surfaces API keys, internal hostnames, and debug endpoints before you ever launch the app. A large share of mobile findings require no running device at all.
  </div>

  <h4>Platform sandboxing — what it does and does not protect</h4>
  <p>Both platforms isolate each app so one cannot read another's private storage. This is a real boundary, but understand its limits precisely, because a great many mobile findings hinge on this distinction.</p>
  <table class="primer-table">
    <tr><th>Threat</th><th>Does the sandbox stop it?</th></tr>
    <tr><td>Another installed app reading your files</td><td><b>Yes</b> — this is exactly what it is for</td></tr>
    <tr><td>A rooted or jailbroken device</td><td><b>No</b> — the sandbox is enforced by the OS the attacker now controls</td></tr>
    <tr><td>Physical access to an unlocked device</td><td><b>No</b></td></tr>
    <tr><td>Data extracted from a device backup</td><td><b>No</b> — unless explicitly excluded from backup</td></tr>
    <tr><td>Data your own app deliberately shares or exports</td><td><b>No</b> — you opted out of the boundary</td></tr>
  </table>
  <p>This is why "the OS sandboxes it" is never a valid mitigation for insecure local storage. The sandbox is the reason that storage is the <i>only</i> thing standing between an attacker with device access and the data.</p>

  <h4>Where local data actually lives</h4>
  <div class="primer-terms">
    <dl class="primer-term"><dt>Structured databases</dt><dd>SQLite files inside the app's private directory. Frequently hold cached user records, messages, and tokens in plaintext.</dd></dl>
    <dl class="primer-term"><dt>Preference files</dt><dd>Shared preferences (Android) or plist files (iOS). Convenient, and routinely misused for secrets.</dd></dl>
    <dl class="primer-term"><dt>Keychain / Keystore</dt><dd>The one genuinely hardware-protected place — but only if used with correct protection classes and access flags, rather than as just another file.</dd></dl>
    <dl class="primer-term"><dt>Caches and logs</dt><dd>Network response caches, crash reports, and verbose debug logs that were never meant to ship.</dd></dl>
    <dl class="primer-term"><dt>External storage</dt><dd>Historically world-readable. Anything sensitive placed here is exposed to other apps by design.</dd></dl>
  </div>

  <h4>Certificate pinning — the gate before network testing</h4>
  <div class="primer-flow">
    <span>Proxy configured</span><i>→</i><span>CA cert installed</span><i>→</i><span>Pinning check</span><i>→</i><span>Bypass required?</span><i>→</i><span>Traffic visible</span>
  </div>
  <p>Apps talk to their backend over HTTPS, so an intercepting proxy works exactly as it does for web — provided the app trusts your certificate. A well-built app implements <b>pinning</b>: hardcoding which certificate or public key it will accept and ignoring the device trust store entirely. Its absence is itself a finding. Its presence means you must bypass it (runtime instrumentation) before any traffic-layer testing can begin — and a pinning implementation that public tooling defeats trivially is a weaker finding than no pinning, but still a finding.</p>

  <h4>Android vs iOS at a glance</h4>
  <table class="primer-table">
    <tr><th></th><th>Android</th><th>iOS</th></tr>
    <tr><td>Package</td><td>APK / AAB</td><td>IPA</td></tr>
    <tr><td>Code</td><td>Dalvik bytecode — decompiles close to source</td><td>Compiled native — harder to read</td></tr>
    <tr><td>Distinctive surface</td><td>Exported components (activities, services, receivers, providers)</td><td>Keychain protection classes, URL scheme handling</td></tr>
    <tr><td>Privilege bypass</td><td>Rooting</td><td>Jailbreaking</td></tr>
    <tr><td>Reference standard</td><td colspan="2">OWASP MASVS / MASTG for both</td></tr>
  </table>

  <div class="primer-note warn">
    <b>Common beginner mistakes</b>
    <ul>
      <li><b>Skipping static analysis.</b> Decompiling and grepping is the fastest path to hardcoded secrets — do it before touching a device.</li>
      <li><b>Stopping at pinning.</b> Pinning blocks your proxy, not the vulnerability. Bypass it and continue; the API behind it usually holds the real findings.</li>
      <li><b>Reporting "app runs on a rooted device" as critical by itself.</b> Establish the actual impact — what does root let an attacker reach that matters?</li>
      <li><b>Ignoring the backend.</b> Most high-severity mobile findings are API findings reached through the app. Test the API on its own terms too.</li>
      <li><b>Treating obfuscation as a fix.</b> It raises cost; it does not remove the secret. A key in an obfuscated binary is still a key in a public binary.</li>
      <li><b>Missing screenshot and clipboard leakage.</b> Background snapshots and clipboard persistence expose sensitive screens with no exploit required.</li>
    </ul>
  </div>
`,

THICK: `
  <h4>What thick client testing actually is</h4>
  <p>A thick client is a desktop application that does real processing locally rather than just rendering what a server sends. Testing one sits between the mobile and network domains: like mobile, you hold the binary and everything local is inspectable; like web, it usually talks to a server, and that traffic follows the same request/response principles as everywhere else.</p>

  <div class="primer-note key">
    <b>Core idea</b>
    A browser is a fairly constrained untrusted client. A thick client is a <b>maximally</b> untrusted one — the user has a debugger, a disassembler, full filesystem access, and complete control of process memory. Any security decision made in that binary can be changed. The only question is how much effort it costs.
  </div>

  <h4>Thin vs thick — why the distinction matters</h4>
  <table class="primer-table">
    <tr><th></th><th>Thin client (web)</th><th>Thick client (desktop)</th></tr>
    <tr><td>Where logic runs</td><td>Almost entirely server-side</td><td>Substantial logic runs locally</td></tr>
    <tr><td>Attack surface</td><td>Requests and responses</td><td>Requests, binary, memory, local files, IPC, registry</td></tr>
    <tr><td>Protocol</td><td>Nearly always HTTP(S)</td><td>Often custom or binary over TCP</td></tr>
    <tr><td>Tooling maturity</td><td>Extremely mature and widely known</td><td>Sparser — which is precisely why bugs survive here</td></tr>
    <tr><td>Typical reviewer attention</td><td>High</td><td>Low</td></tr>
  </table>
  <p>That last row is the practical point. Thick clients frequently carry vulnerability classes that would be embarrassingly obvious in a web app — client-side authorisation, unauthenticated custom protocols, trusted client-generated values — simply because far fewer people are equipped to look.</p>

  <h4>The surfaces you enumerate</h4>
  <div class="primer-terms">
    <dl class="primer-term"><dt>The binary</dt><dd>Decompile or disassemble it. Hardcoded credentials, embedded keys, licence logic, debug menus, and endpoint URLs live here.</dd></dl>
    <dl class="primer-term"><dt>Local storage</dt><dd>Config files, embedded databases, registry keys, logs, and crash dumps — check both contents and file permissions.</dd></dl>
    <dl class="primer-term"><dt>Process memory</dt><dd>Secrets that were decrypted for use and never cleared. Dump the process and search it.</dd></dl>
    <dl class="primer-term"><dt>Network traffic</dt><dd>HTTP is easy; custom binary protocols require a lower-level capture and manual analysis.</dd></dl>
    <dl class="primer-term"><dt>IPC channels</dt><dd>Named pipes, local sockets, shared memory. Frequently unauthenticated because "only our own components use it."</dd></dl>
    <dl class="primer-term"><dt>Privileged helpers</dt><dd>Updaters and services running as SYSTEM. The link between the low-privilege app and the high-privilege helper is a classic escalation path.</dd></dl>
  </div>

  <h4>Frameworks change what testing looks like</h4>
  <table class="primer-table">
    <tr><th>Built with</th><th>Reverse engineering effort</th><th>What to look for first</th></tr>
    <tr><td><b>.NET (C#)</b></td><td>Very low — decompiles near-perfectly to readable source</td><td>Read the logic directly; hardcoded keys, licence checks, BinaryFormatter use</td></tr>
    <tr><td><b>Java</b></td><td>Low — similar decompilation quality</td><td>Native deserialization, embedded credentials, JAR contents</td></tr>
    <tr><td><b>Native C / C++</b></td><td>High — real disassembly and debugging required</td><td>Memory-safety bugs: buffer overflows, format strings, unchecked indexing</td></tr>
    <tr><td><b>Electron</b></td><td>Very low — it is a bundled web app</td><td>All web-testing intuition applies, plus JS now has OS-level access</td></tr>
  </table>

  <h4>Insecure deserialization — a thick client speciality</h4>
  <div class="primer-flow">
    <span>Attacker-controlled data</span><i>→</i><span>Native deserializer</span><i>→</i><span>Object graph rebuilt</span><i>→</i><span>Setup methods auto-run</span><i>→</i><span>Gadget chain executes</span>
  </div>
  <p>Desktop applications routinely use native serialization formats for local files, IPC messages, and network payloads. Unlike JSON, these formats reconstruct <i>arbitrary object types</i> and run their initialisation code during loading. If an attacker controls that data, code executes before application logic ever gets a say. Whenever you see a native deserializer reading anything the user can influence, treat it as critical until proven otherwise.</p>

  <h4>Privilege escalation via the helper service</h4>
  <p>Nearly every desktop app installs something running with elevated rights so updates do not prompt for a password each time. Check three things: the permissions on the service's executable and its directory (can a normal user replace it?), the permissions on any file or task the elevated component reads (can a normal user control its input?), and whether the update package's signature is genuinely verified before execution. A writable file that SYSTEM will later execute is equivalent to SYSTEM access.</p>

  <div class="primer-note warn">
    <b>Common beginner mistakes</b>
    <ul>
      <li><b>Only testing the network traffic.</b> That is one of six surfaces. The binary, memory, local files, IPC, and privileged helpers are where thick-client-specific findings live.</li>
      <li><b>Assuming a custom protocol is secure because it is unfamiliar.</b> Proprietary rarely means authenticated or encrypted — capture it and look.</li>
      <li><b>Reporting decompilability as a finding on its own.</b> Frame it by what it exposes: a hardcoded key, a bypassable check, a licence flaw.</li>
      <li><b>Skipping file and registry permission checks.</b> They are quick, mechanical, and produce genuine privilege-escalation findings.</li>
      <li><b>Ignoring memory.</b> Applications commonly decrypt secrets into memory and never clear them — dumping the process is a reliable technique.</li>
      <li><b>Testing on a machine you cannot restore.</b> Use a snapshot-capable VM; this work modifies system state.</li>
    </ul>
  </div>
`,

WIFI: `
  <h4>What wireless testing actually is</h4>
  <p>Wireless testing is network testing with one property that changes everything: <b>the medium itself cannot be access-controlled</b>. Anyone within radio range receives every frame you transmit, whether or not they are authorised to join. There is no cable to lock in a cabinet. Consequently, all wireless security must be built from cryptography and protocol design — and where either is weak, physical proximity is the only prerequisite for attack.</p>

  <div class="primer-note key">
    <b>Core idea</b>
    On a wired network, capturing traffic requires access to infrastructure. On wireless, capturing traffic requires standing nearby. Everything else in this domain follows from that single fact — including why the handshake matters so much, and why offline attacks are the dominant threat.
  </div>

  <h4>802.11 essentials</h4>
  <div class="primer-terms">
    <dl class="primer-term"><dt>SSID</dt><dd>The network name. Not unique, not authenticated, and freely claimable by anyone — the root of evil twin attacks.</dd></dl>
    <dl class="primer-term"><dt>BSSID</dt><dd>The access point's MAC address. Identifies the physical radio, but is spoofable and almost never checked by users.</dd></dl>
    <dl class="primer-term"><dt>Beacon frame</dt><dd>Broadcast by the AP announcing the network. Unencrypted by necessity — a device must see a network before joining it.</dd></dl>
    <dl class="primer-term"><dt>Probe request</dt><dd>Sent by clients asking "is network X here?" — this is what leaks the list of networks a device has previously joined.</dd></dl>
    <dl class="primer-term"><dt>Management frames</dt><dd>Control the association lifecycle. Historically unauthenticated, which is why deauthentication attacks work.</dd></dl>
    <dl class="primer-term"><dt>Monitor mode</dt><dd>Adapter mode that captures all frames in range rather than only those addressed to you. The prerequisite for nearly all testing here.</dd></dl>
  </div>

  <h4>Security protocol evolution</h4>
  <table class="primer-table">
    <tr><th>Protocol</th><th>Status</th><th>Core weakness</th></tr>
    <tr><td><b>WEP</b></td><td>Completely broken</td><td>24-bit initialisation vector repeats quickly; key recoverable in minutes regardless of password strength</td></tr>
    <tr><td><b>WPA (TKIP)</b></td><td>Deprecated</td><td>A retrofit onto WEP hardware; inherits structural weaknesses</td></tr>
    <tr><td><b>WPA2 (CCMP/AES)</b></td><td>Widely deployed, conditionally sound</td><td>Cryptography is solid; handshake capture enables <i>offline</i> password cracking — security equals passphrase strength</td></tr>
    <tr><td><b>WPA3 (SAE)</b></td><td>Current standard</td><td>Designed to resist offline dictionary attacks; weakened by implementation side-channels and transition-mode downgrade</td></tr>
  </table>
  <div class="primer-note tip">
    <b>Why the handshake is the whole game in WPA2</b>
    The four-way handshake never transmits the passphrase — but it does contain enough material to <i>test guesses</i>. Capture it once (passively, or by forcing a client to reconnect) and every subsequent guess happens offline, at GPU speed, with the network unable to rate-limit, lock out, or even notice. A weak passphrase therefore fails in minutes. WPA3's SAE handshake was built specifically to eliminate this offline-guessing property.
  </div>

  <h4>Personal vs Enterprise</h4>
  <table class="primer-table">
    <tr><th></th><th>WPA2/3-Personal (PSK)</th><th>WPA2/3-Enterprise (802.1X)</th></tr>
    <tr><td>Credential</td><td>One shared passphrase for everyone</td><td>Per-user identity via a RADIUS server</td></tr>
    <tr><td>Accountability</td><td>None — cannot tell users apart</td><td>Per-user, individually logged</td></tr>
    <tr><td>Revocation</td><td>Re-key every device on the network</td><td>Disable one account</td></tr>
    <tr><td>Primary attack</td><td>Capture handshake, crack offline</td><td>Rogue AP + fake RADIUS to harvest credentials</td></tr>
    <tr><td>Critical client setting</td><td>Passphrase strength</td><td><b>Server certificate validation</b> — if off, enterprise is no stronger than open</td></tr>
  </table>
  <p>That last row is the single highest-value check in enterprise wireless. If supplicants do not validate the RADIUS server's certificate, an attacker stands up a same-named network with a fake authentication server, and clients hand over crackable credential material with no warning displayed.</p>

  <h4>The attack pattern that recurs everywhere</h4>
  <div class="primer-flow">
    <span>Passive recon</span><i>→</i><span>Identify target + clients</span><i>→</i><span>Force reconnection</span><i>→</i><span>Capture handshake / credentials</span><i>→</i><span>Offline crack or relay</span>
  </div>
  <p>Deauthentication is the connective tissue: because management frames were historically unauthenticated, an attacker can forge a disconnect and force a fresh handshake on demand rather than waiting for one. Protected Management Frames (802.11w) fix this — but only when set to <i>required</i> rather than <i>optional</i>, and "optional" protects nothing.</p>

  <h4>Rogue AP variants worth distinguishing</h4>
  <table class="primer-table">
    <tr><th>Attack</th><th>Mechanism</th></tr>
    <tr><td><b>Evil twin</b></td><td>Clones a specific, real network name to capture clients that already trust it</td></tr>
    <tr><td><b>Karma</b></td><td>Answers "yes, that's me" to every probe request, catching any device seeking any remembered open network</td></tr>
    <tr><td><b>Rogue AP</b></td><td>An unauthorised AP plugged into the corporate LAN — often by a well-meaning employee, bypassing perimeter controls entirely</td></tr>
    <tr><td><b>Captive portal clone</b></td><td>Fake AP plus a convincing login page, harvesting credentials directly</td></tr>
  </table>

  <div class="primer-note warn">
    <b>Common beginner mistakes</b>
    <ul>
      <li><b>Attacking without written, scoped authorisation.</b> Radio does not respect property lines — you can trivially and illegally affect a neighbour's network. Confirm the target BSSID and get it in writing.</li>
      <li><b>Deauthenticating everyone.</b> Target a specific client. Broadcast deauth is a denial-of-service against every user on the network.</li>
      <li><b>Reporting a captured handshake as a finding.</b> The handshake is capturable by design. The finding is a <i>weak passphrase</i>, proven by actually cracking it.</li>
      <li><b>Testing enterprise Wi-Fi without checking certificate validation.</b> It is the control that decides whether the whole deployment holds.</li>
      <li><b>Assuming WPA3 means finished.</b> Transition mode allows WPA2 downgrade, and early SAE implementations had exploitable side-channels.</li>
      <li><b>Ignoring client-side leakage.</b> Probe requests reveal where a device has been, which is reconnaissance and a privacy finding in its own right.</li>
    </ul>
  </div>
`,

SRC: `
  <h4>What source code review actually is</h4>
  <p>This is the one domain where you have complete ground truth. No black-box guessing about server-side behaviour — you read the logic directly. That is the advantage: you find things dynamic testing can never surface, such as a check that exists but is unreachable, or a dangerous path only triggered by a condition normal use never produces. It is also the discipline required, because it is very easy to drown in code that has no security relevance at all.</p>

  <div class="primer-note key">
    <b>Core idea</b>
    Do not read the codebase. <b>Trace paths through it.</b> Start from where untrusted data enters, follow it, and see whether it reaches something dangerous without adequate handling in between. Reading top-to-bottom is how reviews fail; following data flow is how they succeed.
  </div>

  <h4>The central technique: source → sink</h4>
  <div class="primer-flow">
    <span>SOURCE (untrusted input)</span><i>→</i><span>propagation</span><i>→</i><span>SANITISER?</span><i>→</i><span>SINK (dangerous operation)</span>
  </div>
  <p>Structurally, <b>a vulnerability is an unbroken path from a source to a sink.</b> Everything else is detail.</p>
  <table class="primer-table">
    <tr><th></th><th>Examples</th></tr>
    <tr><td><b>Sources</b><br>where attacker data enters</td><td>Request parameters, headers, cookies, uploaded files, queue messages, database rows written earlier by users, third-party API responses, environment in multi-tenant contexts</td></tr>
    <tr><td><b>Sinks</b><br>where it becomes dangerous</td><td>SQL execution, shell invocation, deserialization, file path construction, template rendering, HTML output, redirect targets, outbound HTTP requests, reflection/dynamic code evaluation</td></tr>
    <tr><td><b>Sanitisers</b><br>what makes it safe</td><td>Parameterised queries, context-aware output encoding, allowlist validation, safe path canonicalisation, type enforcement</td></tr>
  </table>
  <div class="primer-note tip">
    <b>Sanitiser questions that decide the finding</b>
    <ul>
      <li>Is it applied on <b>every</b> path to that sink, or only the obvious one?</li>
      <li>Is it correct for the <b>specific context</b>? HTML-escaping does nothing for a SQL sink, and HTML-body escaping does not protect an attribute or a script block.</li>
      <li>Does it run <b>before</b> the dangerous operation, or after some part of it already happened?</li>
      <li>Can it be bypassed by encoding, double-encoding, or unusual character sets?</li>
    </ul>
  </div>

  <h4>Static vs dynamic — they find different things</h4>
  <table class="primer-table">
    <tr><th></th><th>Source review (SAST-style)</th><th>Black-box testing (DAST-style)</th></tr>
    <tr><td>Question asked</td><td>"Can untrusted data reach this dangerous operation?"</td><td>"What does the app do when I send this?"</td></tr>
    <tr><td>Strength</td><td>Complete coverage, including rarely-reached paths</td><td>Proves real, end-to-end exploitability</td></tr>
    <tr><td>Weakness</td><td>Cannot always tell if a path is reachable in production</td><td>Only sees what it can reach and trigger</td></tr>
    <tr><td>Typical miss</td><td>Runtime/config issues, deployment differences</td><td>Dormant code, second-order flaws, subtle logic errors</td></tr>
  </table>
  <p>Mature programmes use both. When you have code <i>and</i> a running instance, the strongest workflow is to find a candidate path in the code and then confirm it dynamically — you get certainty about the root cause and proof of impact in the same finding.</p>

  <h4>A practical review order</h4>
  <div class="primer-flow">
    <span>Map entry points</span><i>→</i><span>Locate auth/authz layer</span><i>→</i><span>Grep dangerous sinks</span><i>→</i><span>Trace each backwards</span><i>→</i><span>Check config &amp; dependencies</span>
  </div>
  <p>Grepping for sinks generates the worklist fast; tracing backwards from each sink to see whether attacker data can arrive there is the actual analysis. Reviewing authentication and authorisation early pays off because it tells you which findings are reachable pre-auth — often the difference between medium and critical.</p>

  <h4>Patterns worth recognising instantly</h4>
  <div class="primer-terms">
    <dl class="primer-term"><dt>String-built queries</dt><dd>Any query assembled by concatenation or interpolation rather than parameter binding. The most reliably productive grep in any codebase.</dd></dl>
    <dl class="primer-term"><dt>Shell invocation</dt><dd>Functions that run a command string through a shell, as opposed to passing an argument array to a process directly.</dd></dl>
    <dl class="primer-term"><dt>Native deserializers</dt><dd>Any format that reconstructs arbitrary object types from bytes. Untrusted input reaching one is critical by default.</dd></dl>
    <dl class="primer-term"><dt>Auto-binding whole requests</dt><dd>Framework helpers that map an entire request body onto a model with no allowlist — mass assignment.</dd></dl>
    <dl class="primer-term"><dt>Escaping deliberately disabled</dt><dd>A "raw" or "safe" marker telling the templating engine not to encode this value. Always ask why, and what sanitises it instead.</dd></dl>
    <dl class="primer-term"><dt>Path built by concatenation</dt><dd>A base directory joined to user input with no canonicalisation check afterwards — path traversal.</dd></dl>
    <dl class="primer-term"><dt>Comparison of secrets with <code>==</code></dt><dd>Non-constant-time comparison of tokens or signatures, leaking information through timing.</dd></dl>
  </div>

  <h4>Where the non-obvious findings hide</h4>
  <p>Beyond the sink list, three areas repeatedly yield high-value findings: <b>error and exception paths</b> (where a failure defaults to permitting rather than denying), <b>concurrency</b> (a check and its corresponding action split into two non-atomic steps, creating a race), and <b>trust boundary drift</b> (a function written for internal callers, later exposed to external input without revisiting its assumptions).</p>

  <div class="primer-note warn">
    <b>Common beginner mistakes</b>
    <ul>
      <li><b>Reporting raw scanner output.</b> Automated tools flag sink usage, not exploitability. Every finding needs a traced path from a real source.</li>
      <li><b>Reading linearly.</b> Follow data, not files. A codebase is a graph, not a book.</li>
      <li><b>Assuming a sanitiser works because it exists.</b> Read it. Wrong-context and partially-applied sanitisers are extremely common.</li>
      <li><b>Ignoring configuration and dependencies.</b> Framework settings, parser flags, and outdated libraries produce as many real findings as application code does.</li>
      <li><b>Treating internal callers as trusted forever.</b> Today's internal function is next quarter's public endpoint.</li>
      <li><b>Overlooking secrets in version history.</b> A credential removed from current code usually still sits in the commit history.</li>
    </ul>
  </div>
`,

SOCIAL: `
  <h4>What social engineering testing actually is</h4>
  <p>This is the only domain that does not target a system. It targets a person's decision-making under conditions the attacker deliberately engineers. Every other domain assumes a rational actor evaluating a request against fixed rules. This one exploits the fact that people evaluate requests using heuristics, trust, and time pressure — and that those heuristics are reliably predictable.</p>

  <div class="primer-note key">
    <b>Core idea</b>
    You are not testing whether employees are gullible. You are testing whether the <b>organisation's processes</b> allow a plausible-sounding request to bypass a control. A finding is never "Priya clicked the link" — it is "no out-of-band verification is required before a banking change is actioned."
  </div>

  <h4>The engagement lifecycle</h4>
  <div class="primer-flow">
    <span>Authorisation</span><i>→</i><span>OSINT</span><i>→</i><span>Pretext design</span><i>→</i><span>Delivery</span><i>→</i><span>Exploitation</span><i>→</i><span>Measurement</span><i>→</i><span>Debrief</span>
  </div>
  <p>Authorisation comes first and in writing, always — including named authorising executives, a defined target list, agreed pretexts, hard boundaries, and a "get out of jail" letter for any physical component. Measurement matters as much as success: the click rate is interesting, but the <b>report rate</b> is the number that indicates whether the security culture is actually working.</p>

  <h4>The psychological levers</h4>
  <table class="primer-table">
    <tr><th>Lever</th><th>How it works</th><th>Typical pretext</th></tr>
    <tr><td><b>Authority</b></td><td>People comply with perceived seniority and rarely challenge it</td><td>An executive request; an auditor; IT security</td></tr>
    <tr><td><b>Urgency</b></td><td>Compresses the decision window so verification never happens</td><td>"Account suspends in one hour"; a payment deadline</td></tr>
    <tr><td><b>Fear</b></td><td>Threat of consequence overrides careful thinking</td><td>Policy violation notice; failed security check</td></tr>
    <tr><td><b>Social proof</b></td><td>"Everyone else already did this" lowers resistance</td><td>"The rest of your team has completed this"</td></tr>
    <tr><td><b>Reciprocity</b></td><td>A small gift or favour creates obligation</td><td>Free resource, then a small ask</td></tr>
    <tr><td><b>Liking / rapport</b></td><td>Built over multiple contacts before the real request</td><td>A friendly new vendor contact or recruiter</td></tr>
    <tr><td><b>Curiosity</b></td><td>The desire to know overrides caution</td><td>A dropped USB device; an unexpected shared document</td></tr>
  </table>
  <p>Nearly every scenario is two or more of these deliberately combined — authority plus urgency being the most reliable pairing in corporate contexts.</p>

  <h4>Delivery channels</h4>
  <table class="primer-table">
    <tr><th>Vector</th><th>Channel</th><th>Why it works</th></tr>
    <tr><td><b>Phishing</b></td><td>Email, broad</td><td>Volume; filters catch much but not all</td></tr>
    <tr><td><b>Spear phishing</b></td><td>Email, researched and targeted</td><td>Specific details defeat generic scepticism — far higher conversion</td></tr>
    <tr><td><b>Whaling</b></td><td>Email, aimed at executives</td><td>High authority, high access, often lighter technical controls</td></tr>
    <tr><td><b>BEC</b></td><td>Email impersonating an executive or supplier</td><td>Targets a payment process, not a password. Highest financial impact by far</td></tr>
    <tr><td><b>Vishing</b></td><td>Voice call</td><td>Live pressure, no time to reflect, almost no sender verification exists</td></tr>
    <tr><td><b>Smishing</b></td><td>SMS</td><td>Minimal filtering; personal devices; truncated links</td></tr>
    <tr><td><b>Quishing</b></td><td>QR code</td><td>Destination is invisible before scanning, so link-inspection habits never trigger</td></tr>
    <tr><td><b>Tailgating</b></td><td>Physical</td><td>Holding a door is socially rewarded; challenging a stranger is not</td></tr>
    <tr><td><b>Baiting</b></td><td>Dropped media</td><td>Curiosity plus the helpful instinct to return lost property</td></tr>
  </table>

  <h4>OSINT — the work that makes a pretext credible</h4>
  <p>Reconnaissance is where a generic, easily-spotted lure becomes a specific, convincing one. Useful sources include professional networking sites (org structure, reporting lines, new joiners who do not yet know internal norms), job postings (exact technology stack and tooling), corporate materials (naming conventions, terminology, branding), public code repositories, breach corpora (email format and password reuse), and metadata in published documents. No single item is sensitive; the aggregate is what enables the attack — which is itself a reportable finding.</p>

  <h4>Controls that actually work</h4>
  <table class="primer-table">
    <tr><th>Control</th><th>Why it is effective</th></tr>
    <tr><td><b>Out-of-band verification</b></td><td>Confirm via a channel and number already on file — never one supplied in the request. This alone defeats most BEC and help-desk attacks</td></tr>
    <tr><td><b>Dual authorisation</b></td><td>Two people must approve payments or banking changes above a threshold</td></tr>
    <tr><td><b>Phishing-resistant MFA</b></td><td>Hardware keys bound to the origin cannot be relayed through a proxy the way codes can</td></tr>
    <tr><td><b>A frictionless report button</b></td><td>Reporting must be easier than deleting, and reporters must never be punished</td></tr>
    <tr><td><b>Rehearsed scripts</b></td><td>Give staff a socially acceptable way to refuse and verify, so declining does not feel rude</td></tr>
  </table>

  <div class="primer-note warn">
    <b>Ethics and common mistakes — this domain is different</b>
    <ul>
      <li><b>Never name and shame individuals.</b> Report aggregate statistics and process gaps. Publicly identifying someone who clicked destroys the reporting culture you are trying to build.</li>
      <li><b>Avoid cruel pretexts.</b> Fake bonuses, redundancy notices, and bereavement themes cause real distress and damage trust in the security team permanently.</li>
      <li><b>Do not test without organisational authorisation.</b> Individual consent is impossible here, which makes properly documented executive authorisation essential.</li>
      <li><b>Do not stop at the click rate.</b> The metric that matters is whether the process failed and how fast it was reported.</li>
      <li><b>Handle harvested credentials properly.</b> Prove access is possible, then stop; store nothing longer than the engagement requires.</li>
      <li><b>Always debrief supportively.</b> Everyone tested deserves to learn what happened, framed as an organisational lesson rather than a personal failing.</li>
    </ul>
  </div>
`,

};
