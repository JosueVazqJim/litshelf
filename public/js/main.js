$(document).ready(function () {
    $("#searchForm").submit(function (event) {
        // Prevenir el envío del formulario por defecto
        event.preventDefault();

        // // Obtener el valor seleccionado en el select
        // var filterSelect = $("#filterSelect").val();
        // var actionUrl;

        // // Determinar la URL de acción basada en el valor seleccionado
        // switch (filterSelect) {
        //     case "book":
        //         actionUrl = "/searchBooks";
        //         break;
        //     case "author":
        //         actionUrl = "/searchAuthors";
        //         break;
        //     case "genre":
        //         actionUrl = "/searchGenres";
        //         break;
        //     default:
        //         actionUrl = "/searchBooks";
        // }

        // // Ajustar la URL de acción del formulario
        // $("#searchForm").attr("action", actionUrl);

        // // Enviar el formulario con la nueva URL de acción
        this.submit(); // Enviar el formulario
    });
});