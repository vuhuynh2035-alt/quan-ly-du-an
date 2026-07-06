# DEPRECATED — dung scripts\reset-user-password.ps1 -Username "giamdoc" thay the.
# Reset mat khau giam doc (saree.giamdoc@qlcv.local) qua Firebase Admin SDK.
#
# PowerShell:
#   .\scripts\reset-giamdoc-password.ps1 -Password "MatKhauMoi123"
#   .\scripts\reset-giamdoc-password.ps1 -Password "MatKhauMoi123" -Org saree

param(
  [Parameter(Mandatory = $true)]
  [string]$Password,
  [string]$Org = "saree"
)

& (Join-Path $PSScriptRoot "reset-user-password.ps1") -Username "giamdoc" -Password $Password -Org $Org
