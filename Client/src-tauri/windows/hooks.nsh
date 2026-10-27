!define HOOK_DIR "${__FILEDIR__}"

Icon "${HOOK_DIR}\..\icons\icon.ico"
UninstallIcon "${HOOK_DIR}\..\icons\icon.ico"

!macro NSIS_HOOK_POSTINSTALL
  SetOutPath "$INSTDIR"
  File "${HOOK_DIR}\WebView2Loader.dll"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$INSTDIR\WebView2Loader.dll"
!macroend
