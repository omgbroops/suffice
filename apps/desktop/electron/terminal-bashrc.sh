# Load Git Bash's normal environment without its spacious default prompt.
. /etc/profile
for suffice_profile in ~/.bash_profile ~/.bash_login ~/.profile; do
  if [ -r "$suffice_profile" ]; then
    . "$suffice_profile"
    break
  fi
done
unset suffice_profile

# App-local presentation only; never rewrite the user's shell configuration.
PROMPT_COMMAND=
PS1='\[\e[32m\]\u\[\e[0m\] \[\e[36m\]\w\[\e[0m\]'
if declare -F __git_ps1 >/dev/null; then
  PS1+='\[\e[90m\]$(__git_ps1 " (%s)")\[\e[0m\]'
fi
PS1+=' \$ '
