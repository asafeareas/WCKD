// Impede a abertura de um console extra no Windows em builds de produção.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    wckd_lib::run()
}
