FROM node:24.18.0-bookworm@sha256:5711a0d445a1af54af9589066c646df387d1831a608226f4cd694fc59e745059 AS toolchain
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends cmake golang-go openjdk-17-jdk-headless python3-pytest python3-venv rustc cargo unzip && rm -rf /var/lib/apt/lists/*
COPY codex.tar.gz /tmp/codex.tar.gz
RUN echo '3ec55053109608d5038f7e50750f7d25f768dfd740fef071aa710e2559b63aac  /tmp/codex.tar.gz' | sha256sum -c - && mkdir /opt/codex && tar -xzf /tmp/codex.tar.gz -C /opt/codex && rm /tmp/codex.tar.gz
RUN curl --fail --location --retry 2 --max-time 300 https://downloads.gradle.org/distributions/gradle-8.7-bin.zip -o /tmp/gradle.zip && curl --fail --location --retry 2 --max-time 60 https://downloads.gradle.org/distributions/gradle-8.7-bin.zip.sha256 -o /tmp/gradle.sha256 && echo "$(cat /tmp/gradle.sha256)  /tmp/gradle.zip" | sha256sum -c - && mkdir /opt/gradle && unzip -q /tmp/gradle.zip -d /opt/gradle && rm /tmp/gradle.zip /tmp/gradle.sha256
ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
ENV PATH=/opt/codex/bin:/opt/codex/codex-path:/opt/gradle/gradle-8.7/bin:/opt/bench/node_modules/.bin:${PATH}
ENV NODE_PATH=/opt/bench/node_modules
COPY bench-package.json /opt/bench/package.json
RUN cd /opt/bench && npm install --ignore-scripts --no-audit --no-fund
COPY gradle-deps/ /opt/gradle-deps/
RUN gradle --no-daemon --max-workers=2 --gradle-user-home /opt/gradle-cache --project-dir /opt/gradle-deps --init-script /opt/gradle-deps/cache.gradle cacheBenchmarkDependencies
WORKDIR /opt/suffice
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund && mkdir -p .suffice/pi /work /results && chown -R node:node .suffice /work /results
RUN mkdir -p /home/node/.cargo && printf '[build]\ntarget-dir = "/tmp/poly27-cargo-target"\n[net]\noffline = true\n' > /home/node/.cargo/config.toml && chown -R node:node /home/node/.cargo
RUN chmod -R a+rX /opt/gradle-cache
COPY --from=rust:1.85.1-slim-bookworm@sha256:9f841bbe9e7d8e37ceb96ed907265a3a0df7f44e3737d0b100e7907a679acb36 /usr/local/rustup/toolchains/1.85.1-x86_64-unknown-linux-gnu /opt/rust
ENV PATH=/opt/rust/bin:${PATH}
COPY rust-deps/ /opt/rust-deps/
RUN CARGO_HOME=/home/node/.cargo CARGO_NET_OFFLINE=false cargo fetch --locked --manifest-path /opt/rust-deps/decimal/Cargo.toml && CARGO_HOME=/home/node/.cargo CARGO_NET_OFFLINE=false cargo fetch --locked --manifest-path /opt/rust-deps/pig-latin/Cargo.toml && chown -R node:node /home/node/.cargo
ENV HOME=/home/node
ENV CODEX_HOME=/home/node/.codex
ENV GRADLE_USER_HOME=/home/node/.gradle
ENV GOPROXY=off
ENV GOSUMDB=off
ENV CARGO_NET_OFFLINE=true
ENV CARGO_TARGET_DIR=/tmp/poly27-cargo-target
FROM toolchain AS actor
COPY runtime/ /opt/suffice/
USER node
WORKDIR /work
ENTRYPOINT ["node", "/opt/suffice/scripts/poly27-container-entry.mjs"]
FROM toolchain AS grader
COPY grader-runtime/ /opt/suffice/
USER node
WORKDIR /work
ENTRYPOINT ["node", "/opt/suffice/scripts/poly27-grader-entry.mjs"]
