{{/*
Expand the chart name.
*/}}
{{- define "crosspost-webhook.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "crosspost-webhook.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "crosspost-webhook.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels.
*/}}
{{- define "crosspost-webhook.labels" -}}
helm.sh/chart: {{ include "crosspost-webhook.chart" . }}
{{ include "crosspost-webhook.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/component: webhook
app.kubernetes.io/part-of: crosspost
{{- end }}

{{/*
Selector labels.
*/}}
{{- define "crosspost-webhook.selectorLabels" -}}
app.kubernetes.io/name: {{ include "crosspost-webhook.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the service account name.
*/}}
{{- define "crosspost-webhook.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "crosspost-webhook.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Create the secret name.
*/}}
{{- define "crosspost-webhook.secretName" -}}
{{- if .Values.secret.existingSecret }}
{{- .Values.secret.existingSecret }}
{{- else }}
{{- printf "%s-env" (include "crosspost-webhook.fullname" .) }}
{{- end }}
{{- end }}

{{/*
Create the config map name.
*/}}
{{- define "crosspost-webhook.configMapName" -}}
{{- printf "%s-env" (include "crosspost-webhook.fullname" .) }}
{{- end }}

{{/*
Create the PVC name.
*/}}
{{- define "crosspost-webhook.pvcName" -}}
{{- if .Values.persistence.existingClaim }}
{{- .Values.persistence.existingClaim }}
{{- else }}
{{- printf "%s-state" (include "crosspost-webhook.fullname" .) }}
{{- end }}
{{- end }}
