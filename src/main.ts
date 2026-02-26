#!/usr/bin/env gjs

import GLib from 'gi://GLib?version=2.0'

import { App } from '@/app/index.js'
import { APPLICATION_ID, APPLICATION_NAME } from '@/lib/constants.js'

GLib.set_prgname(APPLICATION_ID)
GLib.set_application_name(APPLICATION_NAME)

const app = new App(APPLICATION_ID)

app.run([imports.system.programInvocationName, ...ARGV])
