# SWE-bench Pro gold check (swebpro20)

Sequential gold check via scripts/v4-swebpro-gold.mjs, 420 s cap per task, nice 19. Images removed after each task. Wall = gold+empty run seconds (`-` = not measured).

| instance | repo | kind | wall s |
|---|---|---|---|
| instance_ansible__ansible-d9f1866249756efc264b00ff7497e92c11a9885f | ansible/ansible | pass | 128 |
| instance_ansible__ansible-11c1777d56664b1acb56b387a1ad6aeadef1391d | ansible/ansible | pass | 108 |
| instance_ansible__ansible-1ee70fc272aff6bf3415357c6e13c5de5b928d9b | ansible/ansible | pass | 95 |
| instance_ansible__ansible-e9e6001263f51103e96e58ad382660df0f3d0e39 | ansible/ansible | pass | 116 |
| instance_ansible__ansible-8127abbc298cabf04aaa89a478fc5e5e3432a6fc | ansible/ansible | pass | 218 |
| instance_ansible__ansible-bec27fb4c0a40c5f8bbcf26a475704227d65ee73 | ansible/ansible | infra_pull_error | 328 |
| instance_element-hq__element-web-41dfec20bfe9b62cddbbbf621bef2e9aa9685157 | element-hq/element-web | timeout_420s | 420 |
| instance_element-hq__element-web-27139ca68eb075a4438c18fca184887002a4ffbc | element-hq/element-web | timeout_420s | 420 |
| instance_element-hq__element-web-4c6b0d35add7ae8d58f71ea1711587e31081444b | element-hq/element-web | test_fail | 105 |
| instance_element-hq__element-web-a692fe21811f88d92e8f7047fc615e4f1f986b0f | element-hq/element-web | timeout_420s | 420 |
| instance_element-hq__element-web-9a31cd0fa849da810b4fac6c6c015145e850b282 | element-hq/element-web | timeout_420s | 1908 |
| instance_element-hq__element-web-f14374a51c153f64f313243f2df6ea4971db4e15 | element-hq/element-web | pass | 129 |
| instance_internetarchive__openlibrary-e8084193a895d8ee81200f49093389a3887479ce | internetarchive/openlibrary | pass | 95 |
| instance_internetarchive__openlibrary-427f1f4eddfc54735ca451779d4f95bf683d1b0e | internetarchive/openlibrary | test_fail | 137 |
| instance_internetarchive__openlibrary-1351c59fd43689753de1fca32c78d539a116ffc1 | internetarchive/openlibrary | pass | 164 |
| instance_internetarchive__openlibrary-09865f5fb549694d969f0a8e49b9d204ef1853ca | internetarchive/openlibrary | timeout_420s | 420 |
| instance_internetarchive__openlibrary-308a35d6999427c02b1dbf5211c033ad3b352556 | internetarchive/openlibrary | timeout_420s | 420 |
| instance_internetarchive__openlibrary-30bc73a1395fba2300087c7f307e54bb5372b60a | internetarchive/openlibrary | pass | 212 |
| instance_protonmail__webclients-0ec14e36ceb01ba45602a563e12352af8171ed39 | protonmail/webclients | timeout_420s | 420 |
| instance_protonmail__webclients-708ed4a299711f0fa79a907cc5847cfd39c0fc71 | protonmail/webclients | timeout_420s | 420 |
| instance_protonmail__webclients-1501eb765873b2884b6f1944fd242ecfc9d6b103 | protonmail/webclients | timeout_420s | 420 |
| instance_protonmail__webclients-51742625834d3bd0d10fe0c7e76b8739a59c6b9f | protonmail/webclients | timeout_420s | 420 |
| instance_protonmail__webclients-32ff10999a06455cb2147f6873d627456924ae13 | protonmail/webclients | timeout_420s | 420 |
| instance_protonmail__webclients-caf10ba9ab2677761c88522d1ba8ad025779c492 | protonmail/webclients | timeout_420s | 420 |
| instance_qutebrowser__qutebrowser-8f46ba3f6dc7b18375f7aa63c48a1fe461190430 | qutebrowser/qutebrowser | test_fail | 133 |
| instance_qutebrowser__qutebrowser-9ed748effa8f3bcd804612d9291da017b514e12f | qutebrowser/qutebrowser | pass | 128 |
| instance_qutebrowser__qutebrowser-36ade4bba504eb96f05d32ceab9972df7eb17bcc | qutebrowser/qutebrowser | timeout_420s | 421 |
| instance_qutebrowser__qutebrowser-0aa57e4f7243024fa4bba8853306691b5dbd77b3 | qutebrowser/qutebrowser | pass | 103 |
| instance_qutebrowser__qutebrowser-ec2dcfce9eee9f808efc17a1b99e227fc4421dea | qutebrowser/qutebrowser | pass | 155 |
| instance_qutebrowser__qutebrowser-3fd8e12949b8feda401930574facf09dd4180bba | qutebrowser/qutebrowser | pass | 94 |

Pilot items c09e1439 and 0b621cb0 were gold-verified in the earlier pilot and are included without a re-run (wall `null` in the manifest).

kind: `pass` = gold passes; `test_fail`, `timeout_420s` (killed at 420 s), `infra_pull_error` (ghcr TLS handshake timeout).
