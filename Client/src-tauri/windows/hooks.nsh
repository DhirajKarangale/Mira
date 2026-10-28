!define HOOK_DIR "${__FILEDIR__}"

Icon "${HOOK_DIR}\..\icons\icon.ico"
UninstallIcon "${HOOK_DIR}\..\icons\icon.ico"

!macro NSIS_HOOK_POSTINSTALL
  SetOutPath "$INSTDIR"
  File "${HOOK_DIR}\WebView2Loader.dll"
  ${If} ${FileExists} "$INSTDIR\${MAINBINARYNAME}.exe"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "MIRA" '"$INSTDIR\${MAINBINARYNAME}.exe" --autostart'
  ${ElseIf} ${FileExists} "$INSTDIR\client.exe"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "MIRA" '"$INSTDIR\client.exe" --autostart'
  ${ElseIf} ${FileExists} "$INSTDIR\MIRA.exe"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "MIRA" '"$INSTDIR\MIRA.exe" --autostart'
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$INSTDIR\WebView2Loader.dll"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "MIRA"
!macroend
